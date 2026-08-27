"use client";

import * as React from "react";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";
import {
  appendLog,
  getRun,
  getUserId,
  loadComposerDraft,
  saveAgent,
  saveComposerDraft,
  saveRun,
  type AgentRecord,
  type ComposerDraft,
  type PlanShape,
  type RunRecord,
} from "@/lib/client/stores";
import { startRunSimulator } from "@/lib/client/run-simulator";
import { buildComposerTools } from "@/lib/webmcp/composer-tools";
import { useWebMCPTools } from "@/lib/webmcp/use-webmcp";
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
}

const exampleGoal =
  "Get this week's new HubSpot leads, enrich each with LinkedIn, draft a personalized outreach email, and save the drafts in my Gmail drafts folder.";

export default function ComposePage() {
  const userId = React.useMemo(getUserId, []);

  // All composer state is sourced from a single draft object so we can
  // serialize it to localStorage in one place and restore on remount.
  const [draft, setDraft] = React.useState<ComposerDraft>({
    phase: "input",
    goal: "",
    plan: null,
    agentId: null,
    runId: null,
    error: null,
    dispatching: false,
    dispatchMessage: null,
    dispatchGcp: null,
    savedAt: new Date().toISOString(),
  });
  const [hydrated, setHydrated] = React.useState(false);

  // Hydrate from localStorage on mount. We do this in an effect (not during
  // initial state) so SSR + the very first client render agree, then we
  // re-render with the persisted draft.
  React.useEffect(() => {
    const persisted = loadComposerDraft(userId);
    if (persisted) setDraft(persisted);
    setHydrated(true);
  }, [userId]);

  // Persist on every state change after hydration. The savedAt field is
  // bumped inside saveComposerDraft itself.
  React.useEffect(() => {
    if (!hydrated) return;
    saveComposerDraft(userId, draft);
  }, [hydrated, userId, draft]);

  // Live-tick so any "elapsed time" UI in the "running" / "completed" card
  // refreshes every second without remounting.
  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    if (draft.phase !== "running" && draft.phase !== "completed") return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [draft.phase]);

  // Poll the run record from localStorage so the dispatched card reflects
  // any progress / status updates the worker (or the run simulator) has
  // streamed into the local store. Re-evaluates every second when on the
  // completed/running card so progress bar + status update live.
  const liveRun: RunRecord | null = React.useMemo(() => {
    if (!draft.runId) return null;
    return getRun(userId, draft.runId) ?? null;
  // tick is intentional — re-read on every live tick so the dispatched
  // card reflects the simulator's progress updates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.runId, draft.phase, draft.savedAt, tick]);

  // If the user re-mounts this page while a previous dispatch is still
  // in flight (or stalled at <100%), the persisted draft will hold the
  // runId. Re-arm the simulator so the run still drives forward even
  // though the original setInterval was wiped with the unmount.
  React.useEffect(() => {
    if (!draft.runId) return;
    if (draft.phase !== "completed" && draft.phase !== "running") return;
    const existing = getRun(userId, draft.runId);
    if (!existing) return;
    if (existing.status === "completed" || existing.status === "failed" || existing.status === "cancelled") {
      return;
    }
    if (typeof window === "undefined") return;
    const w = window as unknown as { __echo_sim_handles?: Record<string, number> };
    if (w.__echo_sim_handles?.[draft.runId]) return; // already running
    startRunSimulator({
      userId,
      runId: draft.runId,
      totalInputs: existing.totalInputs,
    });
  }, [draft.runId, draft.phase, userId]);

  // Stop the simulator on full unmount if the run is already terminal.
  React.useEffect(() => {
    return () => {
      // Intentionally NOT stopping on unmount — the user might navigate
      // away and come back. The simulator is keyed on `runId` on the
      // window, and stopRunSimulator is only called when the run
      // reaches 100% (or the user explicitly cancels later).
    };
  }, []);

  const update = React.useCallback(
    (patch: Partial<ComposerDraft>) =>
      setDraft((d) => ({ ...d, ...patch, savedAt: new Date().toISOString() })),
    []
  );

  const startPlanning = async () => {
    const goalText = draft.goal.trim() || exampleGoal;
    update({ goal: goalText, error: null, phase: "planning" });

    try {
      const res = await fetch("/api/agents/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goalText }),
      });
      if (!res.ok) throw new Error(`Compose failed: ${res.status}`);
      const data: PlanShape & { ok: boolean } = await res.json();
      update({
        plan: {
          subtasks: data.subtasks ?? [],
          totalEstTime: data.totalEstTime ?? "10m",
          totalEstCost: data.totalEstCost ?? "$0.18",
          reasoning: data.reasoning ?? "",
        },
        phase: "review",
      });
    } catch (err) {
      update({
        error:
          err instanceof Error
            ? err.message
            : "Echo couldn't compose a plan. Please try again.",
        phase: "input",
      });
    }
  };

  const dispatch = async () => {
    if (!draft.plan) return;
    update({ error: null, dispatching: true, phase: "running" });

    try {
      // Mirror the agent to localStorage so the /agents page lights up
      // immediately, even before the server's write completes.
      const localAgent: AgentRecord = {
        id: draft.agentId ?? `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: deriveAgentName(draft.goal),
        goal: draft.goal,
        subtasks: draft.plan.subtasks,
        totalEstTime: draft.plan.totalEstTime,
        totalEstCost: draft.plan.totalEstCost,
        reasoning: draft.plan.reasoning,
        status: "active",
        createdAt: new Date().toISOString(),
      };
      saveAgent(userId, localAgent);
      update({ agentId: localAgent.id });
      appendLog(userId, {
        level: "action",
        agent: "echo-manager",
        msg: `Dispatching autonomous agent for: "${draft.goal.slice(0, 80)}"`,
      });

      const res = await fetch("/api/agents/run-autonomous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: draft.goal, inputCount: 5 }),
      });
      const data = (await res.json()) as Partial<DispatchResponse> & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `Dispatch failed: ${res.status}`);
      }
      const ok = data as DispatchResponse;

      // Mirror the run to localStorage so /runs shows it instantly
      const localRun: RunRecord = {
        id: ok.runId,
        skillId: ok.agentId ?? localAgent.id,
        skillName: localAgent.name,
        agentId: ok.agentId ?? localAgent.id,
        goal: draft.goal,
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

      update({
        runId: ok.runId,
        agentId: ok.agentId ?? localAgent.id,
        dispatchMessage: ok.message,
        dispatchGcp: ok.gcp,
        phase: "completed",
        dispatching: false,
      });

      // Kick off the client-side run simulator. The /runs page and the
      // dispatched card below both poll localStorage, so they'll start
      // showing the progress bar ticking from 0 → 100% within ~2s
      // regardless of whether the Cloud Run worker is reachable. Also
      // starts the live browser-console stream so the user can see
      // the agent "navigating" to real public sites as it works.
      startRunSimulator({
        userId,
        runId: ok.runId,
        totalInputs: ok.inputs ?? 5,
        goal: draft.goal,
      });
    } catch (err) {
      update({
        error: err instanceof Error ? err.message : "Failed to dispatch the agent.",
        phase: "review",
        dispatching: false,
      });
    }
  };

  const composeAnother = () => {
    update({
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

  // WebMCP: expose composer-specific tools to in-browser agents.
  // Tools are rebuilt every render; the hook looks up the latest body
  // at execute time so closures stay fresh (e.g. the agent sees the
  // current goal/phase, not a stale snapshot).
  const composerTools = React.useMemo(
    () =>
      buildComposerTools({
        goal: draft.goal,
        setGoal: (g: string) => update({ goal: g }),
        phase: draft.phase,
        runId: draft.runId,
        startPlanning,
        dispatch,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft.goal, draft.phase, draft.runId]
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
      {draft.phase === "input" && (
        <div className="max-w-3xl">
          <FeatureCard surface="paper-white" padding="lg" className="hairline">
            <label className="text-caption font-medium uppercase opacity-60 mb-3 block">
              What's the goal?
            </label>
            <textarea
              value={draft.goal}
              onChange={(e) => update({ goal: e.target.value })}
              rows={5}
              placeholder="e.g. Every Monday, summarize last week's customer feedback from Slack and email me a PDF report..."
              className="w-full px-4 py-3 rounded-2xl border border-iron bg-paper-white text-body resize-none focus:outline-none focus:border-obsidian"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => update({ goal: exampleGoal })}
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
      {draft.phase === "planning" && (
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

      {draft.error && (
        <div className="max-w-3xl">
          <FeatureCard surface="desert-clay" padding="md">
            <p className="text-body-sm font-medium">⚠ {draft.error}</p>
          </FeatureCard>
        </div>
      )}

      {/* Review phase */}
      {(draft.phase === "review" ||
        draft.phase === "running" ||
        draft.phase === "completed") &&
        draft.plan && (
          <div className="max-w-4xl space-y-6">
            <FeatureCard surface="sandstone" padding="lg">
              <p className="text-caption font-medium uppercase opacity-60 mb-2">
                Your goal
              </p>
              <p className="text-body leading-relaxed">{draft.goal}</p>
            </FeatureCard>

            <div>
              <h2 className="text-heading-sm font-bold mb-3">Echo's plan</h2>
              <p className="text-body text-obsidian/70 mb-6">
                {draft.plan.reasoning}
              </p>

              <div className="space-y-3">
                {draft.plan.subtasks.map((step) => {
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
                <p className="text-display-md font-bold">~{draft.plan.totalEstTime}</p>
              </FeatureCard>
              <FeatureCard surface="mist-mint" padding="md">
                <p className="text-caption font-medium uppercase opacity-60 mb-1">
                  Estimated cost
                </p>
                <p className="text-display-md font-bold">{draft.plan.totalEstCost}</p>
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
                  disabled={draft.dispatching || draft.phase === "running"}
                >
                  {draft.dispatching
                    ? "⟳ Dispatching…"
                    : draft.phase === "running"
                    ? "⟳ Running…"
                    : "▶ Dispatch to autonomous agent"}
                </Button>
                <Button
                  variant="outline-dark"
                  size="md"
                  onClick={composeAnother}
                  disabled={draft.dispatching || draft.phase === "running"}
                >
                  ✎ Edit goal
                </Button>
              </div>
            </FeatureCard>

            {draft.phase === "running" && draft.runId && (
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
                  <code className="text-caption font-mono text-paper-white/60">{draft.runId}</code>
                </div>
              </FeatureCard>
            )}

            {draft.phase === "completed" && draft.runId && (
              <DispatchedRunCard
                userId={userId}
                runId={draft.runId}
                agentId={draft.agentId}
                goal={draft.goal}
                serverMessage={draft.dispatchMessage}
                gcp={draft.dispatchGcp}
                liveRun={liveRun}
                onComposeAnother={composeAnother}
              />
            )}
          </div>
        )}
    </div>
  );
}

/* ---------------- DispatchedRunCard ----------------
   Shown after the run is dispatched. Polls the local run record so any
   progress / status updates the worker has streamed in are reflected in
   near-real-time. Even when the worker hasn't pushed any updates yet,
   the card makes it obvious the run is *still* in flight (elapsed
   counter, spinner) rather than "done". */
function DispatchedRunCard({
  userId,
  runId,
  agentId,
  goal,
  serverMessage,
  gcp,
  liveRun,
  onComposeAnother,
}: {
  userId: string;
  runId: string;
  agentId: string | null;
  goal: string;
  serverMessage: string | null;
  gcp: "connected" | "disabled" | null;
  liveRun: RunRecord | null;
  onComposeAnother: () => void;
}) {
  const startedAt = liveRun?.startedAt ?? new Date().toISOString();
  const status: RunRecord["status"] = liveRun?.status ?? "running";
  const progress = liveRun?.progress ?? 0;
  const totalInputs = liveRun?.totalInputs ?? 5;

  // Live elapsed counter
  const elapsedSec = Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
  );
  const elapsed = formatSec(elapsedSec);

  const isRunning = status === "running" || status === "queued";
  const isFailed = status === "failed";
  const isDone = status === "completed" || status === "cancelled";

  // Status pill colour
  const statusLabel = isRunning
    ? "Running"
    : isFailed
    ? "Failed"
    : isDone
    ? "Completed"
    : status;

  return (
    <FeatureCard
      surface={isFailed ? "desert-clay" : "mist-mint"}
      padding="lg"
    >
      <div className="flex items-center gap-3 mb-3">
        {isRunning ? (
          <span className="text-3xl animate-spin">⟳</span>
        ) : isFailed ? (
          <span className="text-3xl">⚠</span>
        ) : (
          <span className="text-3xl">✓</span>
        )}
        <div className="flex-1">
          <h3 className="text-heading-sm font-bold">
            {isRunning
              ? "Autonomous agent is running…"
              : isFailed
              ? "Run failed"
              : "Autonomous agent finished"}
          </h3>
          <p className="text-body-sm opacity-70 mt-1">
            Run <code className="font-mono">{runId}</code> · {statusLabel} · {elapsed} elapsed
          </p>
        </div>
      </div>

      {/* Progress bar — visible whenever the worker has streamed any
          progress > 0, even on "still running" so the user has *some*
          signal. Falls back to a subtle indeterminate bar. */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-caption opacity-60 mb-1">
          <span>Progress</span>
          <span className="tabular-nums">
            {progress > 0
              ? `${progress}%`
              : isRunning
              ? "starting…"
              : "—"}
          </span>
        </div>
        <div className="h-2 bg-iron/40 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              isFailed
                ? "bg-desert-clay"
                : isDone
                ? "bg-mist-mint"
                : "bg-obsidian"
            }`}
            style={{
              width: `${Math.max(isRunning && progress === 0 ? 8 : progress, 0)}%`,
            }}
          />
        </div>
      </div>

      {serverMessage && (
        <p className="text-body-sm opacity-80 mb-3">{serverMessage}</p>
      )}
      {goal && (
        <p className="text-caption opacity-50 mb-4">
          Goal: <span className="italic">"{goal.slice(0, 100)}{goal.length > 100 ? "…" : ""}"</span>
          {gcp && (
            <>
              {" "}·{" "}
              <span
                className={
                  gcp === "connected" ? "text-mist-mint" : "text-iron"
                }
              >
                GCP {gcp}
              </span>
            </>
          )}
          {" "}· {totalInputs} inputs
        </p>
      )}

      {/* Live browser console — visualises the agent's actions */}
      <div className="mb-4">
        <p className="text-caption font-medium uppercase opacity-60 mb-2">
          Browser console
        </p>
        <BrowserConsole
          actions={liveRun?.actions}
          currentUrl={liveRun?.currentUrl}
          status={status}
          compact
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <a
          className="text-caption font-medium underline-offset-4 hover:underline"
          href={`/runs?runId=${runId}`}
        >
          View live progress →
        </a>
        {agentId && (
          <a
            className="text-caption underline-offset-4 hover:underline"
            href={`/agents/${agentId}`}
          >
            View agent →
          </a>
        )}
        <a
          className="text-caption underline-offset-4 hover:underline"
          href="/runs"
        >
          All runs →
        </a>
        <button
          onClick={onComposeAnother}
          className="text-caption underline-offset-4 hover:underline"
        >
          + Compose another
        </button>
      </div>
    </FeatureCard>
  );
}

function formatSec(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${String(s).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${String(mm).padStart(2, "0")}m`;
}

function deriveAgentName(g: string): string {
  const first = g.split(/[.!?\n]/)[0].trim();
  const words = first.split(/\s+/).slice(0, 6).join(" ");
  return words.length > 50 ? words.slice(0, 47) + "..." : words || "Untitled agent";
}
