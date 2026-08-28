"use client";

/**
 * ComposerCard — a single composer slot in the multi-composer grid.
 *
 * Each card owns its own goal, plan, dispatched run, live progress,
 * and browser console. All cards run independently and in parallel:
 * dispatching one doesn't block the others, and each gets its own
 * runId + simulator + browser-runner.
 *
 * The card is intentionally compact (no full plan review panel,
 * no server-message callouts) so 4 of them fit in a 2×2 grid on
 * desktop and stack on mobile. The full plan detail is still
 * available by clicking the agent's "View agent" link after dispatch.
 *
 * Phase machine (mirrors the original single-composer):
 *   input  → planning → review → running → completed
 *               │                  │
 *               └──── error ───────┘  (returns to input/review)
 */

import * as React from "react";
import { Button, FeatureCard, FeatureTag } from "@/components/ui";
import {
  appendLog,
  getRun,
  getUserId,
  saveAgent,
  type ComposerSlot,
  type PlanShape,
  type RunRecord,
} from "@/lib/client/stores";
import { startRunSimulator } from "@/lib/client/run-simulator";
import { startBrowserRunner } from "@/lib/client/browser-runner";
import { BrowserConsole } from "@/components/BrowserConsole";

interface DispatchResponse {
  ok: boolean;
  runId: string;
  agentId: string | null;
  plan: PlanShape;
  inputs: number;
  goal: string;
  gcp: "connected" | "disabled";
  message: string;
  skill: { suggestedName: string; intent: string; steps: Array<{ num: number; title: string; detail: string; at: string }> };
  browserStops: Array<{
    url: string;
    site: string;
    label: string;
    actions: Array<{
      type: "click" | "fill" | "type" | "press" | "wait" | "hover" | "scroll" | "extract" | "screenshot" | "select";
      selector?: string;
      value?: string;
      text?: string;
      key?: string;
      ms?: number;
      direction?: "up" | "down" | "top" | "bottom";
      amount?: number;
      label: string;
      timeout?: number;
    }>;
  }>;
}

const exampleGoal =
  "Get this week's new HubSpot leads, enrich each with LinkedIn, draft a personalized outreach email, and save the drafts in my Gmail drafts folder.";

const PHASE_LABEL: Record<ComposerSlot["phase"], string> = {
  input: "Idle",
  planning: "Composing…",
  review: "Ready",
  running: "Running",
  completed: "Done",
};

const PHASE_BG: Record<ComposerSlot["phase"], string> = {
  input: "bg-iron/40",
  planning: "bg-dusty-sky/40",
  review: "bg-mist-mint/40",
  running: "bg-wisteria/50",
  completed: "bg-mist-mint/60",
};

interface ComposerCardProps {
  slot: ComposerSlot;
  /** Index in the grid, used to label the card "Composer 1" etc. */
  index: number;
  isActive: boolean;
  canClose: boolean;
  onUpdate: (patch: Partial<ComposerSlot>) => void;
  onActivate: () => void;
  onClose: () => void;
  onRequestRun: (slotId: string, runId: string) => void;
}

export function ComposerCard({
  slot,
  index,
  isActive,
  canClose,
  onUpdate,
  onActivate,
  onClose,
}: ComposerCardProps) {
  const userId = React.useMemo(getUserId, []);

  // Live-tick so progress + status update every second.
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (slot.phase !== "running" && slot.phase !== "completed") return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [slot.phase]);

  // Poll the run record from localStorage so live progress reflects
  // what the simulator (or the real browser-runner) has streamed in.
  const liveRun: RunRecord | null = React.useMemo(() => {
    if (!slot.runId) return null;
    return getRun(userId, slot.runId) ?? null;
    // tick is intentional — re-read on every live tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.runId, slot.phase, slot.savedAt, tick]);

  // Re-arm the simulator if the user re-mounts this card while a
  // previous dispatch is still in flight.
  React.useEffect(() => {
    if (!slot.runId) return;
    if (slot.phase !== "completed" && slot.phase !== "running") return;
    const existing = getRun(userId, slot.runId);
    if (!existing) return;
    if (existing.status === "completed" || existing.status === "failed" || existing.status === "cancelled") {
      return;
    }
    if (typeof window === "undefined") return;
    const w = window as unknown as { __echo_sim_handles?: Record<string, number> };
    if (w.__echo_sim_handles?.[slot.runId]) return;
    startRunSimulator({
      userId,
      runId: slot.runId,
      totalInputs: existing.totalInputs,
    });
  }, [slot.runId, slot.phase, userId]);

  const startPlanning = async () => {
    const goalText = slot.goal.trim() || exampleGoal;
    onUpdate({ goal: goalText, error: null, phase: "planning" });

    try {
      const res = await fetch("/api/agents/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goalText }),
      });
      if (!res.ok) throw new Error(`Compose failed: ${res.status}`);
      const data: PlanShape & { ok: boolean } = await res.json();
      onUpdate({
        plan: {
          subtasks: data.subtasks ?? [],
          totalEstTime: data.totalEstTime ?? "10m",
          totalEstCost: data.totalEstCost ?? "$0.18",
          reasoning: data.reasoning ?? "",
        },
        phase: "review",
      });
    } catch (err) {
      onUpdate({
        error: err instanceof Error ? err.message : "Echo couldn't compose a plan. Please try again.",
        phase: "input",
      });
    }
  };

  const dispatch = async () => {
    if (!slot.plan) return;
    onUpdate({ error: null, dispatching: true, phase: "running" });

    try {
      const localAgent = {
        id: slot.agentId ?? `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: deriveAgentName(slot.goal),
        goal: slot.goal,
        subtasks: slot.plan.subtasks,
        totalEstTime: slot.plan.totalEstTime,
        totalEstCost: slot.plan.totalEstCost,
        reasoning: slot.plan.reasoning,
        status: "active" as const,
        createdAt: new Date().toISOString(),
      };
      saveAgent(userId, localAgent);
      onUpdate({ agentId: localAgent.id });
      appendLog(userId, {
        level: "action",
        agent: "echo-manager",
        msg: `[Composer ${index + 1}] Dispatching autonomous agent for: "${slot.goal.slice(0, 80)}"`,
      });

      const res = await fetch("/api/agents/run-autonomous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: slot.goal, inputCount: 5 }),
      });
      const data = (await res.json()) as Partial<DispatchResponse> & { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Dispatch failed: ${res.status}`);
      const ok = data as DispatchResponse;

      const localRun: RunRecord = {
        id: ok.runId,
        // Use the LOCAL agent id for both the run and the agent
        // record so the agents-page filter (`r.agentId === id`)
        // finds linked runs. The server's ok.agentId (when GCP is
        // connected) is for its own tracking on the worker side; we
        // keep the user-facing linkage consistent.
        skillId: localAgent.id,
        skillName: localAgent.name,
        agentId: localAgent.id,
        goal: slot.goal,
        inputs: Array.from({ length: ok.inputs ?? 5 }, (_, i) => ({
          id: `input_${i + 1}`,
          payload: { row: i + 1 },
        })),
        totalInputs: ok.inputs ?? 5,
        status: "running",
        progress: 0,
        startedAt: new Date().toISOString(),
        gcp: ok.gcp,
        message: ok.message,
      };
      // saveRun is in stores.ts but we re-imported via getRun; mirror
      // via the same module so write goes through the right channel.
      const { saveRun } = await import("@/lib/client/stores");
      saveRun(userId, localRun);

      appendLog(userId, {
        level: "success",
        agent: "echo-manager",
        scope: ok.runId,
        msg: `Run ${ok.runId} dispatched. Agent driving headless browser.`,
      });

      onUpdate({
        runId: ok.runId,
        agentId: localAgent.id,
        dispatchMessage: ok.message,
        dispatchGcp: ok.gcp,
        phase: "completed",
        dispatching: false,
      });

      startRunSimulator({
        userId,
        runId: ok.runId,
        totalInputs: ok.inputs ?? 5,
        goal: slot.goal,
      });
      if (ok.browserStops?.length) {
        startBrowserRunner({
          userId,
          runId: ok.runId,
          stops: ok.browserStops,
        });
      }
    } catch (err) {
      onUpdate({
        error: err instanceof Error ? err.message : "Failed to dispatch the agent.",
        phase: "review",
        dispatching: false,
      });
    }
  };

  const reset = () => {
    onUpdate({
      phase: "input",
      plan: null,
      runId: null,
      agentId: null,
      dispatchMessage: null,
      dispatchGcp: null,
      error: null,
      dispatching: false,
    });
  };

  const status = liveRun?.status ?? "running";
  const progress = liveRun?.progress ?? 0;
  const isRunning = slot.phase === "running";
  const isCompleted = slot.phase === "completed";
  const showConsole = isRunning || isCompleted;

  return (
    <div
      onClick={onActivate}
      className={`relative h-full flex flex-col rounded-2xl bg-paper-white hairline p-6 cursor-pointer transition-shadow ${
        isActive ? "ring-2 ring-obsidian/30 shadow-md" : "hover:shadow-md"
      }`}
    >
      {/* Header: index + label + close */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wide text-obsidian/40">
            Composer {index + 1}
          </span>
          <span
            className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full text-obsidian/70 ${PHASE_BG[slot.phase]}`}
          >
            {PHASE_LABEL[slot.phase]}
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          disabled={!canClose}
          title={canClose ? "Close this composer" : "Can't close the last composer"}
          className="w-6 h-6 rounded-full hairline bg-bone text-obsidian/60 hover:bg-desert-clay/20 hover:text-desert-clay disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-caption"
          aria-label="Close composer"
        >
          ✕
        </button>
      </div>

      {/* Goal input (only in input phase) */}
      {(slot.phase === "input" || slot.phase === "planning") && (
        <div className="space-y-2">
          <textarea
            value={slot.goal}
            onChange={(e) => onUpdate({ goal: e.target.value })}
            onFocus={onActivate}
            onClick={(e) => e.stopPropagation()}
            rows={3}
            placeholder="Describe a goal in plain English…"
            className="w-full px-3 py-2 rounded-xl border border-iron bg-paper-white text-body-sm resize-none focus:outline-none focus:border-obsidian"
            disabled={slot.phase === "planning"}
          />
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUpdate({ goal: exampleGoal });
            }}
            className="text-[10px] text-obsidian/60 hover:text-obsidian underline-offset-4 hover:underline"
          >
            Try an example →
          </button>
        </div>
      )}

      {/* Plan preview (review phase) */}
      {slot.phase === "review" && slot.plan && (
        <div className="space-y-2">
          <p className="text-caption text-obsidian/60 line-clamp-2 italic">
            "{slot.goal.slice(0, 80)}{slot.goal.length > 80 ? "…" : ""}"
          </p>
          <ul className="space-y-1">
            {slot.plan.subtasks.slice(0, 3).map((s) => (
              <li key={s.num} className="flex items-start gap-2 text-caption">
                <span className="shrink-0 w-4 h-4 rounded-full bg-obsidian text-paper-white text-[9px] font-bold flex items-center justify-center">
                  {s.num}
                </span>
                <span className="truncate text-obsidian/80">{s.title}</span>
              </li>
            ))}
            {slot.plan.subtasks.length > 3 && (
              <li className="text-caption text-obsidian/50 pl-6">
                +{slot.plan.subtasks.length - 3} more steps
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Running / completed header */}
      {showConsole && liveRun && (
        <div className="space-y-1">
          <p className="text-caption text-obsidian/60 line-clamp-1 italic">
            "{slot.goal.slice(0, 60)}{slot.goal.length > 60 ? "…" : ""}"
          </p>
          <div className="flex items-center gap-2 text-caption">
            <span className="font-mono text-obsidian/50 truncate">{liveRun.id.slice(0, 16)}</span>
            <span className="text-obsidian/40">·</span>
            <span className="text-obsidian/70 tabular-nums">{progress}%</span>
            <span className="text-obsidian/40">·</span>
            <span className="text-obsidian/70">
              {liveRun.totalInputs} inputs
            </span>
          </div>
          <div className="h-1.5 bg-iron/40 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                isCompleted ? "bg-mist-mint" : "bg-obsidian"
              }`}
              style={{ width: `${Math.max(progress, isRunning ? 4 : 0)}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {slot.error && (
        <p className="text-caption text-desert-clay">⚠ {slot.error}</p>
      )}

      {/* Live browser console (compact) */}
      {showConsole && liveRun && (
        <div className="flex-1 min-h-0">
          <BrowserConsole
            actions={liveRun.actions}
            currentUrl={liveRun.currentUrl}
            status={status}
            compact
            tail={5}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-iron/40" onClick={(e) => e.stopPropagation()}>
        {slot.phase === "input" && (
          <Button variant="dark" size="sm" onClick={startPlanning}>
            ❖ Compose
          </Button>
        )}
        {slot.phase === "planning" && (
          <Button variant="dark" size="sm" disabled>
            ⟳ Composing…
          </Button>
        )}
        {slot.phase === "review" && (
          <>
            <Button
              variant="dark"
              size="sm"
              onClick={dispatch}
              disabled={slot.dispatching}
            >
              {slot.dispatching ? "⟳ Dispatching…" : "▶ Dispatch"}
            </Button>
            <Button variant="outline-dark" size="sm" onClick={() => onUpdate({ phase: "input" })}>
              ✎ Edit
            </Button>
          </>
        )}
        {showConsole && liveRun && (
          <a
            className="text-[10px] font-medium underline-offset-4 hover:underline text-obsidian/70 self-center"
            href={`/runs/${liveRun.id}`}
          >
            View run →
          </a>
        )}
        {isCompleted && (
          <button
            onClick={reset}
            className="text-[10px] font-medium underline-offset-4 hover:underline text-obsidian/70 self-center ml-auto"
          >
            + Compose another
          </button>
        )}
      </div>
    </div>
  );
}

function deriveAgentName(g: string): string {
  const first = g.split(/[.!?\n]/)[0].trim();
  const words = first.split(/\s+/).slice(0, 6).join(" ");
  return words.length > 50 ? words.slice(0, 47) + "..." : words || "Untitled agent";
}
