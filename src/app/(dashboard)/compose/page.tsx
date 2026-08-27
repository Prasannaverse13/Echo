"use client";

import * as React from "react";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";
import {
  appendLog,
  getUserId,
  saveAgent,
  saveRun,
  type AgentRecord,
  type RunRecord,
} from "@/lib/client/stores";
import { buildComposerTools } from "@/lib/webmcp/composer-tools";
import { useWebMCPTools } from "@/lib/webmcp/use-webmcp";

type Phase = "input" | "planning" | "review" | "running" | "completed";

interface SubTask {
  num: number;
  title: string;
  matchedSkill: string;
  parallel: boolean;
  estTime: string;
}

interface Plan {
  subtasks: SubTask[];
  totalEstTime: string;
  totalEstCost: string;
  reasoning: string;
}

interface DispatchResponse {
  ok: boolean;
  runId: string;
  agentId: string | null;
  plan: Plan;
  inputs: number;
  goal: string;
  gcp: "connected" | "disabled";
  message: string;
  skill: { suggestedName: string; intent: string; steps: Array<{ num: number; title: string; detail: string; at: string }> };
}

const exampleGoal =
  "Get this week's new HubSpot leads, enrich each with LinkedIn, draft a personalized outreach email, and save the drafts in my Gmail drafts folder.";

export default function ComposePage() {
  const userId = React.useMemo(getUserId, []);
  const [phase, setPhase] = React.useState<Phase>("input");
  const [goal, setGoal] = React.useState("");
  const [plan, setPlan] = React.useState<Plan | null>(null);
  const [agentId, setAgentId] = React.useState<string | null>(null);
  const [runId, setRunId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [dispatching, setDispatching] = React.useState<boolean>(false);
  const [dispatchResult, setDispatchResult] = React.useState<DispatchResponse | null>(null);

  const startPlanning = async () => {
    setError(null);
    const goalText = goal.trim() || exampleGoal;
    setGoal(goalText);
    setPhase("planning");

    try {
      const res = await fetch("/api/agents/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goalText }),
      });
      if (!res.ok) throw new Error(`Compose failed: ${res.status}`);
      const data: Plan & { ok: boolean } = await res.json();
      setPlan({
        subtasks: data.subtasks ?? [],
        totalEstTime: data.totalEstTime ?? "10m",
        totalEstCost: data.totalEstCost ?? "$0.18",
        reasoning: data.reasoning ?? "",
      });
      setPhase("review");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Echo couldn't compose a plan. Please try again."
      );
      setPhase("input");
    }
  };

  const dispatch = async () => {
    if (!plan) return;
    setError(null);
    setDispatching(true);
    setPhase("running");

    try {
      // Mirror the agent to localStorage so the /agents page lights up
      // immediately, even before the server's write completes.
      const localAgent: AgentRecord = {
        id: agentId ?? `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: deriveAgentName(goal),
        goal,
        subtasks: plan.subtasks,
        totalEstTime: plan.totalEstTime,
        totalEstCost: plan.totalEstCost,
        reasoning: plan.reasoning,
        status: "active",
        createdAt: new Date().toISOString(),
      };
      saveAgent(userId, localAgent);
      setAgentId(localAgent.id);
      appendLog(userId, {
        level: "action",
        agent: "echo-manager",
        msg: `Dispatching autonomous agent for: "${goal.slice(0, 80)}"`,
      });

      const res = await fetch("/api/agents/run-autonomous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal, inputCount: 5 }),
      });
      const data = (await res.json()) as Partial<DispatchResponse> & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Dispatch failed: ${res.status}`);
      }
      const ok = data as DispatchResponse;
      setRunId(ok.runId);
      setDispatchResult(ok);
      if (ok.agentId) setAgentId(ok.agentId);

      // Mirror the run to localStorage so /runs shows it instantly
      const localRun: RunRecord = {
        id: ok.runId,
        skillId: ok.agentId ?? localAgent.id,
        skillName: localAgent.name,
        agentId: ok.agentId ?? localAgent.id,
        goal,
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
      saveRun(userId, localRun);

      appendLog(userId, {
        level: "success",
        agent: "echo-manager",
        scope: ok.runId,
        msg: `Run ${ok.runId} dispatched. Agent driving headless browser.`,
      });

      setPhase("completed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dispatch the agent.");
      setPhase("review");
    } finally {
      setDispatching(false);
    }
  };

  // WebMCP: expose composer-specific tools to in-browser agents.
  // Tools are rebuilt every render; the hook looks up the latest body
  // at execute time so closures stay fresh (e.g. the agent sees the
  // current goal/phase, not a stale snapshot).
  const composerTools = React.useMemo(
    () =>
      buildComposerTools({
        goal,
        setGoal,
        phase,
        runId,
        startPlanning,
        dispatch,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [goal, phase, runId]
  );
  useWebMCPTools(composerTools);

  return (
    <div className="page-container py-10">
      <div className="mb-8">
        <p className="text-caption text-obsidian/50 mb-2">Skill Composer</p>
        <h1 className="text-display-md font-bold">Describe a goal. Echo composes the agent.</h1>
        <p className="mt-3 text-body text-obsidian/70 max-w-2xl">
          Tell Echo what you want done, in plain English. The Skill Manager
          breaks it into steps, finds the right skills, and dispatches a
          sub-agent to run it — autonomously, in the background, with a
          real headless browser.
        </p>
      </div>

      {/* Input phase */}
      {phase === "input" && (
        <div className="max-w-3xl">
          <FeatureCard surface="paper-white" padding="lg" className="hairline">
            <label className="text-caption font-medium uppercase opacity-60 mb-3 block">
              What's the goal?
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={5}
              placeholder="e.g. Every Monday, summarize last week's customer feedback from Slack and email me a PDF report..."
              className="w-full px-4 py-3 rounded-2xl border border-iron bg-paper-white text-body resize-none focus:outline-none focus:border-obsidian"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => setGoal(exampleGoal)}
                className="text-caption text-obsidian/60 hover:text-obsidian underline-offset-4 hover:underline"
              >
                Try an example →
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-iron flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <FeatureTag variant="iron">🧠 Gemini</FeatureTag>
                <FeatureTag variant="iron">🌐 Real browser</FeatureTag>
                <FeatureTag variant="iron">⏵ Runs once</FeatureTag>
              </div>
              <Button variant="light" size="md" onClick={startPlanning}>
                ❖ Compose agent
              </Button>
            </div>
          </FeatureCard>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <FeatureCard surface="dusty-sky" padding="md">
              <p className="text-caption font-medium uppercase opacity-60 mb-1">
                Example
              </p>
              <p className="text-body-sm font-bold mb-2">Daily lead enrichment</p>
              <p className="text-body-sm opacity-80">
                HubSpot → LinkedIn → personalized email → Gmail drafts
              </p>
            </FeatureCard>
            <FeatureCard surface="wisteria" padding="md">
              <p className="text-caption font-medium uppercase opacity-60 mb-1">
                Example
              </p>
              <p className="text-body-sm font-bold mb-2">Weekly content repurposing</p>
              <p className="text-body-sm opacity-80">
                Blog post → platform-specific social copy → schedule
              </p>
            </FeatureCard>
            <FeatureCard surface="desert-clay" padding="md">
              <p className="text-caption font-medium uppercase opacity-60 mb-1">
                Example
              </p>
              <p className="text-body-sm font-bold mb-2">Customer health monitor</p>
              <p className="text-body-sm opacity-80">
                Stripe usage → Slack alerts when churn risk detected
              </p>
            </FeatureCard>
          </div>
        </div>
      )}

      {/* Planning phase */}
      {phase === "planning" && (
        <FeatureCard surface="obsidian" padding="lg" className="text-paper-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-paper-white/10 flex items-center justify-center">
              <span className="text-2xl animate-spin">⟳</span>
            </div>
            <div>
              <h2 className="text-heading-sm font-bold">Echo is composing...</h2>
              <p className="text-body-sm text-paper-white/60 mt-1">
                Breaking your goal into steps, matching skills, drafting a plan.
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-2 text-caption text-paper-white/40 font-mono">
            <p>→ Parsing goal semantics with Gemini 3.5 Flash...</p>
            <p>→ Decomposing into sub-tasks...</p>
            <p>→ Searching your skill library...</p>
            <p>→ Drafting orchestrator plan...</p>
          </div>
        </FeatureCard>
      )}

      {error && (
        <div className="max-w-3xl">
          <FeatureCard surface="desert-clay" padding="md">
            <p className="text-body-sm font-medium">⚠ {error}</p>
          </FeatureCard>
        </div>
      )}

      {/* Review phase */}
      {(phase === "review" || phase === "running" || phase === "completed") && plan && (
        <div className="max-w-4xl space-y-6">
          <FeatureCard surface="sandstone" padding="lg">
            <p className="text-caption font-medium uppercase opacity-60 mb-2">
              Your goal
            </p>
            <p className="text-body leading-relaxed">{goal}</p>
          </FeatureCard>

          <div>
            <h2 className="text-heading-sm font-bold mb-3">Echo's plan</h2>
            <p className="text-body text-obsidian/70 mb-6">
              {plan.reasoning}
            </p>

            <div className="space-y-3">
              {plan.subtasks.map((step) => {
                const isNew = step.matchedSkill.startsWith("NEW:");
                return (
                  <FeatureCard
                    key={step.num}
                    surface="paper-white"
                    padding="md"
                    className="hairline"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-obsidian text-paper-white flex items-center justify-center font-bold">
                        {step.num}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-body font-bold">{step.title}</h3>
                        <p className="text-caption text-obsidian/60 mt-0.5">
                          {isNew ? (
                            <>
                              Needs new skill:{" "}
                              <em>{step.matchedSkill.replace("NEW: ", "")}</em>
                            </>
                          ) : (
                            <>
                              Uses skill: <em>{step.matchedSkill}</em>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {step.parallel && (
                          <FeatureTag variant="wisteria">⚡ Parallel</FeatureTag>
                        )}
                        {isNew && (
                          <FeatureTag variant="desert-clay">+ Record</FeatureTag>
                        )}
                        <span className="text-caption text-obsidian/50">
                          ~{step.estTime}
                        </span>
                      </div>
                    </div>
                  </FeatureCard>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FeatureCard surface="dusty-sky" padding="md">
              <p className="text-caption font-medium uppercase opacity-60 mb-1">
                Total estimated time
              </p>
              <p className="text-display-md font-bold">~{plan.totalEstTime}</p>
            </FeatureCard>
            <FeatureCard surface="mist-mint" padding="md">
              <p className="text-caption font-medium uppercase opacity-60 mb-1">
                Estimated cost
              </p>
              <p className="text-display-md font-bold">{plan.totalEstCost}</p>
            </FeatureCard>
          </div>

          <FeatureCard surface="obsidian" padding="lg" className="text-paper-white">
            <h3 className="text-heading-sm font-bold mb-3">Dispatch the autonomous agent</h3>
            <p className="text-body-sm text-paper-white/70 mb-4">
              Echo will fire this plan into the background. The agent opens
              a real headless Chromium, calls Gemini to decide what to do at
              each step, and writes the result to Firestore. You don't
              schedule anything — you dispatch once, and the agent does the
              rest on its own.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="dark"
                size="md"
                onClick={dispatch}
                disabled={dispatching || phase === "running"}
              >
                {dispatching
                  ? "⟳ Dispatching…"
                  : phase === "running"
                  ? "⟳ Running…"
                  : "▶ Dispatch to autonomous agent"}
              </Button>
              <Button
                variant="outline-dark"
                size="md"
                onClick={() => setPhase("input")}
                disabled={dispatching || phase === "running"}
              >
                ✎ Edit goal
              </Button>
            </div>
          </FeatureCard>

          {phase === "running" && runId && (
            <FeatureCard surface="obsidian" padding="lg" className="text-paper-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-paper-white/10 flex items-center justify-center">
                  <span className="text-2xl animate-spin">⟳</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-heading-sm font-bold">Run started</h3>
                  <p className="text-body-sm text-paper-white/60 mt-1">
                    The autonomous agent is driving the headless browser.
                    Watch progress on the{" "}
                    <a className="underline" href="/runs">Runs</a> page.
                  </p>
                </div>
                <code className="text-caption font-mono text-paper-white/60">{runId}</code>
              </div>
            </FeatureCard>
          )}

          {phase === "completed" && runId && (
            <FeatureCard surface="mist-mint" padding="lg">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">✓</span>
                <div className="flex-1">
                  <h3 className="text-heading-sm font-bold">Autonomous agent dispatched</h3>
                  <p className="text-body-sm opacity-70 mt-1">
                    Run <code className="font-mono">{runId}</code> is queued
                    in the worker. The Cloud Run worker is driving the
                    headless browser; events stream into Firestore as the
                    agent decides what to do.
                  </p>
                </div>
              </div>
              {dispatchResult && (
                <p className="text-body-sm opacity-80 mb-4">{dispatchResult.message}</p>
              )}
              <div className="flex flex-wrap gap-3">
                <a className="text-caption underline-offset-4 hover:underline" href={`/runs/${runId}`}>
                  View run →
                </a>
                <a className="text-caption underline-offset-4 hover:underline" href="/runs">
                  All runs →
                </a>
                <a className="text-caption underline-offset-4 hover:underline" href="/agents">
                  View agents →
                </a>
                <button
                  onClick={() => {
                    setPhase("input");
                    setPlan(null);
                    setRunId(null);
                    setDispatchResult(null);
                    setError(null);
                  }}
                  className="text-caption underline-offset-4 hover:underline"
                >
                  + Compose another
                </button>
              </div>
            </FeatureCard>
          )}
        </div>
      )}
    </div>
  );
}

function deriveAgentName(g: string): string {
  const first = g.split(/[.!?\n]/)[0].trim();
  const words = first.split(/\s+/).slice(0, 6).join(" ");
  return words.length > 50 ? words.slice(0, 47) + "..." : words || "Untitled agent";
}
