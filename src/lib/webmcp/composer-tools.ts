"use client";

/**
 * Composer-specific WebMCP tools.
 *
 * Exposed on the `/compose` page. The agent can:
 *   - preview a plan before dispatching
 *   - fire the autonomous run
 *   - prefill / update the goal text
 *   - drive the same UX buttons the user would click
 *   - inspect the current composer state
 *
 * Every tool ends up calling the same Next.js API routes the buttons
 * hit, so behavior is identical to the manual flow. The only delta is
 * the run is kicked off from the agent instead of a click.
 */

import type { WebMCPToolDefinition } from "./types";
import { fireToast } from "./global-tools";
import { appendLog, getUserId, saveAgent, saveRun, type AgentRecord, type RunRecord } from "@/lib/client/stores";

export type ComposerPhase = "input" | "planning" | "review" | "running" | "completed";

export interface BuildComposerToolsOpts {
  /** Current goal text (state-controlled). */
  goal: string;
  /** Update the goal text. */
  setGoal: (g: string) => void;
  /** Current phase. */
  phase: ComposerPhase;
  /** Last dispatched runId, if any. */
  runId: string | null;
  /** Mirror the agent to localStorage + log, same as the dispatch() in the page. */
  startPlanning: () => Promise<void>;
  /** Fire the run-autonomous flow. */
  dispatch: () => Promise<void>;
}

/**
 * Build a small synthetic input batch mirroring buildInputsFromGoal() in
 * /api/agents/run-autonomous. Used so the dispatch tool can also
 * pre-mirror the run to localStorage (matching what the click handler
 * does) so the /runs page lights up instantly.
 */
function deriveName(goal: string): string {
  const first = goal.split(/[.!?\n]/)[0].trim();
  const words = first.split(/\s+/).slice(0, 6).join(" ");
  return words.length > 50 ? words.slice(0, 47) + "..." : words || "Autonomous agent";
}

interface ComposePlanResponse {
  ok: boolean;
  subtasks: Array<{ num: number; title: string; matchedSkill: string; parallel: boolean; estTime: string }>;
  totalEstTime: string;
  totalEstCost: string;
  reasoning: string;
}

interface DispatchResponse {
  ok: boolean;
  runId: string;
  agentId: string | null;
  plan: ComposePlanResponse;
  inputs: number;
  goal: string;
  gcp: "connected" | "disabled";
  message: string;
  skill: {
    suggestedName: string;
    intent: string;
    steps: Array<{ num: number; title: string; detail: string; at: string }>;
  };
}

export function buildComposerTools(opts: BuildComposerToolsOpts): WebMCPToolDefinition[] {
  const userId = getUserId();

  return [
    {
      name: "preview_echo_plan",
      title: "Preview Echo plan",
      description:
        "Generate a step-by-step plan for a goal using Echo's Skill Manager WITHOUT dispatching it. Returns the plan as structured JSON. Use this first to show the user what's about to happen.",
      inputSchema: {
        type: "object",
        properties: {
          goal: {
            type: "string",
            description: "Plain-English goal (e.g. 'summarize last week\\'s customer feedback').",
          },
        },
        required: ["goal"],
      },
      annotations: { readOnlyHint: true },
      execute: async ({ goal }) => {
        const res = await fetch("/api/agents/compose", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goal: String(goal) }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `compose failed: HTTP ${res.status}`);
        }
        return (await res.json()) as ComposePlanResponse;
      },
    },
    {
      name: "compose_echo_agent",
      title: "Compose Echo agent",
      description:
        "Dispatch an autonomous Echo agent for a goal. The agent runs in the background and uses a real headless browser to execute the workflow. Returns the runId, the agentId, and a human message. This is the headline tool for demoing WebMCP end-to-end.",
      inputSchema: {
        type: "object",
        properties: {
          goal: {
            type: "string",
            description: "Plain-English goal to dispatch.",
          },
          inputCount: {
            type: "number",
            minimum: 1,
            maximum: 20,
            description: "How many inputs to process (1-20). Defaults to 5.",
          },
          showToast: {
            type: "boolean",
            description: "If true, also fire a success toast in the UI. Default true.",
          },
        },
        required: ["goal"],
      },
      annotations: { readOnlyHint: false },
      execute: async ({ goal, inputCount, showToast }) => {
        const g = String(goal);
        const n = Math.max(1, Math.min(20, Number(inputCount) || 5));
        const res = await fetch("/api/agents/run-autonomous", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goal: g, inputCount: n }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `dispatch failed: HTTP ${res.status}`);
        }
        const data = (await res.json()) as DispatchResponse;

        // Mirror to localStorage so the /runs page lights up immediately,
        // exactly like the click handler does.
        const agentName = deriveName(g);
        const agentRecord: AgentRecord = {
          id: data.agentId ?? `agent_${Date.now()}_local`,
          name: agentName,
          goal: g,
          subtasks: data.plan.subtasks,
          totalEstTime: data.plan.totalEstTime,
          totalEstCost: data.plan.totalEstCost,
          reasoning: data.plan.reasoning,
          status: "active",
          createdAt: new Date().toISOString(),
        };
        saveAgent(userId, agentRecord);

        const runRecord: RunRecord = {
          id: data.runId,
          skillId: data.agentId ?? agentRecord.id,
          skillName: agentName,
          agentId: data.agentId ?? agentRecord.id,
          goal: g,
          inputs: Array.from({ length: data.inputs }, (_, i) => ({
            id: `input_${i + 1}`,
            payload: { row: i + 1 },
          })),
          totalInputs: data.inputs,
          status: "running",
          progress: 0,
          startedAt: new Date().toISOString(),
          gcp: data.gcp,
          message: data.message,
        };
        saveRun(userId, runRecord);

        appendLog(userId, {
          level: "success",
          agent: "echo-manager",
          scope: data.runId,
          msg: `Run ${data.runId} dispatched via WebMCP. Agent driving headless browser.`,
        });

        if (showToast !== false) {
          fireToast({
            level: "success",
            message: `Dispatched: ${agentName} (${data.inputs} inputs)`,
          });
        }

        return {
          runId: data.runId,
          agentId: data.agentId,
          message: data.message,
          inputs: data.inputs,
          gcp: data.gcp,
          plan: data.plan,
        };
      },
    },
    {
      name: "set_composer_goal",
      title: "Set composer goal",
      description:
        "Update the goal text in the composer's input field without submitting. Useful for prefilling from a template or pasting a long goal without typing it.",
      inputSchema: {
        type: "object",
        properties: {
          goal: { type: "string", description: "New goal text." },
        },
        required: ["goal"],
      },
      annotations: { readOnlyHint: false },
      execute: ({ goal }) => {
        opts.setGoal(String(goal));
        return { ok: true, goalLength: String(goal).length };
      },
    },
    {
      name: "start_planning",
      title: "Start planning",
      description:
        "Trigger the 'Compose agent' button on the current goal. The composer transitions to the planning phase and fetches a plan. No run is dispatched yet.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: false },
      execute: async () => {
        await opts.startPlanning();
        return { ok: true, phase: opts.phase };
      },
    },
    {
      name: "dispatch_current_plan",
      title: "Dispatch current plan",
      description:
        "Fire the plan currently shown in the review phase as an autonomous run. The composer must already be in the 'review' phase (call preview_echo_plan or start_planning first).",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: false },
      execute: async () => {
        await opts.dispatch();
        return { ok: true, runId: opts.runId, phase: opts.phase };
      },
    },
    {
      name: "get_composer_state",
      title: "Get composer state",
      description:
        "Returns the current composer state: goal text, phase (input/planning/review/running/completed), last runId. Useful to drive conditional tool flows.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => ({
        goal: opts.goal.slice(0, 500),
        goalLength: opts.goal.length,
        phase: opts.phase,
        runId: opts.runId,
      }),
    },
  ];
}
