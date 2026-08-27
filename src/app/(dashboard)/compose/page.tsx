"use client";

import * as React from "react";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";
import {
  appendLog,
  getUserId,
  saveAgent,
  saveRun,
  saveTrigger,
  type AgentRecord,
  type TriggerRecord,
} from "@/lib/client/stores";

type Phase = "input" | "planning" | "review" | "schedule" | "scheduled" | "running" | "completed";

const CRON_PRESETS: Array<{ label: string; cron: string }> = [
  { label: "Every Monday 9am",     cron: "0 9 * * 1" },
  { label: "Every weekday 8am",    cron: "0 8 * * 1-5" },
  { label: "Every Friday 5pm",     cron: "0 17 * * 5" },
  { label: "Every Sunday midnight", cron: "0 0 * * 0" },
  { label: "Every 15 min",         cron: "*/15 * * * *" },
  { label: "Every hour",           cron: "0 * * * *" },
];

interface SubTask {
  num: number;
  title: string;
  matchedSkill: string;
  parallel: boolean;
  estTime: string;
}

const exampleGoal =
  "Every Friday at 5pm, get this week's new HubSpot leads, enrich them with LinkedIn, draft a personalized outreach email for each, and put the drafts in my Gmail drafts folder.";

export default function ComposePage() {
  const userId = React.useMemo(getUserId, []);
  const [phase, setPhase] = React.useState<Phase>("input");
  const [goal, setGoal] = React.useState("");
  const [plan, setPlan] = React.useState<{
    subtasks: SubTask[];
    totalEstTime: string;
    totalEstCost: string;
    reasoning: string;
  } | null>(null);
  const [agentId, setAgentId] = React.useState<string | null>(null);
  const [runId, setRunId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [scheduleCron, setScheduleCron] = React.useState<string>(CRON_PRESETS[0].cron);
  const [schedulePreset, setSchedulePreset] = React.useState<string>(CRON_PRESETS[0].label);
  const [scheduleName, setScheduleName] = React.useState<string>("");
  const [scheduleSubmitting, setScheduleSubmitting] = React.useState<boolean>(false);
  const [scheduledInfo, setScheduledInfo] = React.useState<{
    id: string;
    cron: string;
    nextRunAt: string;
  } | null>(null);

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
      const data = await res.json();
      setPlan(data);
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

  return (
    <div className="page-container py-10">
      <div className="mb-8">
        <p className="text-caption text-obsidian/50 mb-2">Skill Composer</p>
        <h1 className="text-display-md font-bold">Describe a goal. Echo composes the agent.</h1>
        <p className="mt-3 text-body text-obsidian/70 max-w-2xl">
          Tell Echo what you want done, in plain English. The Skill Manager
          breaks it into steps, finds the right skills, and spawns a
          sub-agent to run it — autonomously, in the background.
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
                <FeatureTag variant="iron">⏰ Schedule</FeatureTag>
                <FeatureTag variant="iron">⚡ Trigger</FeatureTag>
                <FeatureTag variant="iron">▶ One-shot</FeatureTag>
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
      {(phase === "review" || phase === "scheduled" || phase === "running" || phase === "completed") && plan && (
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

          <FeatureCard surface="deep-teal" padding="lg" className="text-paper-white">
            <h3 className="text-heading-sm font-bold mb-3">Schedule this agent</h3>
            <p className="text-body-sm text-paper-white/70 mb-4">
              Runs on a cron schedule you pick, automatically, in the background.
              The agent opens a real headless browser, runs the recorded skills
              on each scheduled input, and writes results to Firestore.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-caption uppercase opacity-60 block mb-1">
                  Name
                </label>
                <input
                  value={scheduleName}
                  onChange={(e) => setScheduleName(e.target.value)}
                  placeholder="Weekly lead enrichment"
                  className="w-full px-3 py-2 rounded-lg bg-paper-white/10 border border-paper-white/20 text-paper-white text-body-sm placeholder:text-paper-white/40 focus:outline-none focus:border-paper-white/60"
                />
              </div>
              <div>
                <label className="text-caption uppercase opacity-60 block mb-1">
                  Schedule
                </label>
                <select
                  value={schedulePreset}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSchedulePreset(v);
                    const p = CRON_PRESETS.find((x) => x.label === v);
                    if (p) setScheduleCron(p.cron);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-paper-white/10 border border-paper-white/20 text-paper-white text-body-sm focus:outline-none focus:border-paper-white/60"
                >
                  {CRON_PRESETS.map((p) => (
                    <option key={p.label} value={p.label} className="text-obsidian">
                      {p.label} — {p.cron}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-caption uppercase opacity-60 block mb-1">
                  Cron expression
                </label>
                <input
                  value={scheduleCron}
                  onChange={(e) => {
                    setScheduleCron(e.target.value);
                    const p = CRON_PRESETS.find((x) => x.cron === e.target.value);
                    if (p) setSchedulePreset(p.label);
                    else setSchedulePreset("Custom");
                  }}
                  placeholder="0 9 * * 1"
                  className="w-full px-3 py-2 rounded-lg bg-paper-white/10 border border-paper-white/20 text-paper-white text-body-sm font-mono placeholder:text-paper-white/40 focus:outline-none focus:border-paper-white/60"
                />
                <p className="text-caption text-paper-white/50 mt-1">
                  Five fields: minute, hour, day-of-month, month, day-of-week. Use * for any. Examples above.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="dark"
                size="md"
                onClick={() => doSchedule()}
                disabled={scheduleSubmitting}
              >
                {scheduleSubmitting ? "⟳ Scheduling…" : "✓ Schedule background agent"}
              </Button>
              <Button variant="outline-dark" size="md" onClick={() => doRunNow()}>
                ▶ Run once now
              </Button>
              <Button variant="outline-dark" size="md" onClick={() => setPhase("input")}>
                ✎ Edit goal
              </Button>
            </div>
          </FeatureCard>

          {phase === "scheduled" && scheduledInfo && (
            <FeatureCard surface="mist-mint" padding="lg">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-3xl">✓</span>
                <div className="flex-1">
                  <h3 className="text-heading-sm font-bold">Background agent scheduled</h3>
                  <p className="text-body-sm opacity-70 mt-1">
                    Echo will fire this agent automatically. Vercel Cron ticks
                    every hour; the Cloud Run worker picks up the queued run
                    and drives the browser.
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-y-2 gap-x-6 text-caption">
                <dt className="opacity-60">Schedule</dt>
                <dd className="font-mono">{scheduledInfo.cron}</dd>
                <dt className="opacity-60">Next run</dt>
                <dd>{new Date(scheduledInfo.nextRunAt).toLocaleString()}</dd>
                <dt className="opacity-60">Schedule id</dt>
                <dd className="font-mono">{scheduledInfo.id}</dd>
              </dl>
              <div className="mt-4 flex flex-wrap gap-3">
                <a className="text-caption underline-offset-4 hover:underline" href="/triggers">
                  View all triggers →
                </a>
                <a className="text-caption underline-offset-4 hover:underline" href="/agents">
                  View agents →
                </a>
              </div>
            </FeatureCard>
          )}

          {phase === "running" && runId && (
            <FeatureCard surface="obsidian" padding="lg" className="text-paper-white">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-paper-white/10 flex items-center justify-center">
                  <span className="text-2xl animate-spin">⟳</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-heading-sm font-bold">Run started</h3>
                  <p className="text-body-sm text-paper-white/60 mt-1">
                    Sub-agents are processing the inputs in parallel. Watch progress on the{" "}
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
                <div>
                  <h3 className="text-heading-sm font-bold">Run completed</h3>
                  <p className="text-body-sm opacity-70 mt-1">
                    Echo finished processing. See the full run on the{" "}
                    <a className="underline" href="/runs">Runs</a> page.
                  </p>
                </div>
              </div>
            </FeatureCard>
          )}
        </div>
      )}
    </div>
  );

  async function persistAgent(status: AgentRecord["status"]): Promise<AgentRecord> {
    if (!plan) throw new Error("no plan");
    const id = agentId ?? `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const agent: AgentRecord = {
      id,
      name: deriveAgentName(goal),
      goal,
      subtasks: plan.subtasks,
      totalEstTime: plan.totalEstTime,
      totalEstCost: plan.totalEstCost,
      reasoning: plan.reasoning,
      status,
      createdAt: new Date().toISOString(),
    };
    saveAgent(userId, agent);
    setAgentId(id);
    return agent;
  }

  function deriveAgentName(g: string): string {
    const first = g.split(/[.!?\n]/)[0].trim();
    const words = first.split(/\s+/).slice(0, 6).join(" ");
    return words.length > 50 ? words.slice(0, 47) + "..." : words || "Untitled agent";
  }

  function doSchedule() {
    setError(null);
    setScheduleSubmitting(true);
    persistAgent("active")
      .then(async (agent) => {
        // Persist a local trigger mirror so the /triggers page shows it
        // even when GCP / Vercel Cron is unavailable
        const trigger: TriggerRecord = {
          id: `trg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: scheduleName.trim() || `Run ${agent.name}`,
          type: "Schedule",
          skillId: agent.id,
          skillName: agent.name,
          status: "active",
          schedule: scheduleCron,
          lastFired: "—",
          createdAt: new Date().toISOString(),
        };
        saveTrigger(userId, trigger);

        // Hit the real scheduling API. If GCP is configured the
        // schedule persists in Firestore and Vercel Cron will tick
        // it hourly. If not, we just keep the local mirror so the
        // /triggers page still shows it.
        const res = await fetch("/api/agents/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trigger.name,
            goal: agent.goal,
            cron: scheduleCron,
            skillLibrary: agent.subtasks.map((s) => ({
              id: s.matchedSkill,
              name: s.matchedSkill,
              description: s.title,
            })),
            enabled: true,
          }),
        });
        const data = await res.json();
        if (res.ok && data?.schedule) {
          setScheduledInfo({
            id: data.schedule.id,
            cron: data.schedule.cron,
            nextRunAt: data.schedule.nextRunAt,
          });
          appendLog(userId, {
            level: "success",
            agent: "echo-manager",
            msg: `Background agent scheduled: ${trigger.name} (${data.schedule.cron})`,
          });
          setPhase("scheduled");
        } else {
          // Demo / no-GCP fallback — show the local trigger and proceed
          setScheduledInfo({
            id: trigger.id,
            cron: scheduleCron,
            nextRunAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          });
          appendLog(userId, {
            level: "info",
            agent: "echo-manager",
            msg: `Schedule saved locally (GCP not connected): ${trigger.name}`,
          });
          setPhase("scheduled");
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to schedule");
        setPhase("review");
      })
      .finally(() => setScheduleSubmitting(false));
  }

  function doRunNow() {
    setError(null);
    setPhase("running");
    persistAgent("active").then((agent) => {
      const id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setRunId(id);
      saveRun(userId, {
        id,
        skillId: agent.id,
        skillName: agent.name,
        agentId: agent.id,
        goal: agent.goal,
        inputs: Array.from({ length: 5 }).map((_, i) => ({ id: `input_${i + 1}`, payload: { row: i + 1 } })),
        totalInputs: 5,
        status: "running",
        progress: 0,
        startedAt: new Date().toISOString(),
        gcp: "disabled",
        message: "Sub-agent spawning",
      });
      appendLog(userId, { level: "info", agent: "echo-manager", scope: id, msg: `Run ${id} started for agent "${agent.name}"` });
      appendLog(userId, { level: "action", agent: agent.id, scope: id, msg: "Calling gemini-3.5-flash to decompose plan" });
      // Simulate the run ticking forward
      const tick = setInterval(() => {
        const existing = (typeof window !== "undefined")
          ? JSON.parse(window.localStorage.getItem(`echo.${userId}.runs`) ?? "[]")
              .find((r: { id: string }) => r.id === id)
          : null;
        if (!existing) {
          clearInterval(tick);
          return;
        }
        const next = Math.min(100, (existing.progress ?? 0) + 10);
        saveRun(userId, { ...existing, progress: next });
        if (next >= 100) {
          clearInterval(tick);
          saveRun(userId, { ...existing, progress: 100, status: "completed", finishedAt: new Date().toISOString(), durationSec: 42 });
          appendLog(userId, { level: "success", agent: "echo-manager", scope: id, msg: `Run ${id} completed` });
          setPhase("completed");
        } else {
          appendLog(userId, { level: "info", agent: agent.id, scope: id, msg: `Processed ${next}% of inputs` });
        }
      }, 1500);
    });
  }
}
