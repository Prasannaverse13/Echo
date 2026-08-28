"use client";

/**
 * Agent detail page.
 *
 * Resolves an agent id to its record in two sources, in order:
 *   1. The local `agents` store (echo.${userId}.agents) — where the
 *      composer's dispatch flow saves every agent it spawns.
 *   2. A small hardcoded seed map with a single demo agent
 *      (`rfp-responder`) so the marketing/demo story still resolves
 *      to something interesting when the user navigates to /agents
 *      without first dispatching anything.
 *
 * If neither has the id, we render a friendly "not found" card
 * instead of letting Next.js's global 404 swallow the page. The
 * previous version called `notFound()` for every real agent id and
 * resulted in a white screen whenever a user clicked "View agent"
 * on a /runs detail page.
 *
 * The "Convert to skill" button is wired to the skill.md exporter:
 * when the user clicks it, a portable skill.md file containing the
 * goal, plan, action log, and inline screenshots is downloaded to
 * the user's machine. The file is self-contained and re-runnable
 * from any Echo workspace.
 */

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";
import {
  getAgent,
  getUserId,
  listRuns,
  type AgentRecord,
  type RunRecord,
} from "@/lib/client/stores";
import { downloadSkillMd, downloadSkillPack } from "@/lib/client/skill-md";

const seedAgent = {
  id: "rfp-responder",
  name: "RFP Responder",
  goal: "Process 1,000 incoming RFPs and draft responses.",
  parent: "Auto-composed by Skill Manager",
  spawnedAt: "Aug 21, 09:14",
  progress: 234,
  total: 1000,
  eta: "~14h",
  status: "running" as const,
  skills: ["RFP Response Drafting", "Slack Notifier"],
  trace: [
    { ts: "11:42:08", step: "Picked up input 'Globex RFI.pdf'", level: "info" as const },
    { ts: "11:42:09", step: "Extracted 23 questions from PDF", level: "success" as const },
    { ts: "11:42:11", step: "Searching knowledge vault...", level: "info" as const },
    { ts: "11:42:14", step: "Found 18 matches (5 high-confidence, 13 medium)", level: "info" as const },
    { ts: "11:42:18", step: "Drafting response to Q1: 'Company overview'", level: "action" as const },
    { ts: "11:42:19", step: "✓ Drafted (used 'about-us.md', case-study-acme.pdf)", level: "success" as const },
    { ts: "11:42:21", step: "Drafting response to Q2: 'SOC 2 compliance'", level: "action" as const },
    { ts: "11:42:24", step: "✓ Drafted (used soc2-report.pdf)", level: "success" as const },
    { ts: "11:42:26", step: "Drafting response to Q3: 'Pricing for 500 seats'", level: "action" as const },
    { ts: "11:42:28", step: "⚠ No high-confidence match. Flagged for human review.", level: "warn" as const },
    { ts: "11:42:31", step: "Saved draft to Drive/RFPs/globex-rfi-draft.docx", level: "success" as const },
    { ts: "11:42:32", step: "Notified #sales via Slack", level: "info" as const },
    { ts: "11:42:33", step: "─── Next input: 'Initech Security Audit.pdf' ───", level: "info" as const },
  ],
  cost: [
    { label: "Tokens used", value: "1.2M" },
    { label: "Estimated cost", value: "$0.84" },
    { label: "Runtime", value: "2h 28m" },
    { label: "Avg / run", value: "$0.004" },
  ],
};

const statusMeta: Record<string, { color: "dusty-sky" | "wisteria" | "desert-clay" | "mist-mint" | "iron"; label: string; symbol: string }> = {
  running: { color: "desert-clay", label: "Running", symbol: "◉" },
  completed: { color: "mist-mint", label: "Done", symbol: "✓" },
  review: { color: "wisteria", label: "Needs you", symbol: "!" },
  failed: { color: "iron", label: "Failed", symbol: "✕" },
  paused: { color: "iron", label: "Paused", symbol: "⏸" },
  planning: { color: "dusty-sky", label: "Planning", symbol: "⟳" },
  active: { color: "desert-clay", label: "Active", symbol: "◉" },
  archived: { color: "iron", label: "Archived", symbol: "▣" },
};

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const userId = React.useMemo(getUserId, []);
  const id = params?.id ?? "";

  const [hydrated, setHydrated] = React.useState(false);
  const [stored, setStored] = React.useState<AgentRecord | null>(null);
  const [runs, setRuns] = React.useState<RunRecord[]>([]);

  React.useEffect(() => {
    setStored(getAgent(userId, id) ?? null);
    setRuns(listRuns(userId).filter((r) => r.agentId === id));
    setHydrated(true);
  }, [userId, id]);

  // After hydration, resolve the agent: stored first, then seed.
  const seed = !hydrated ? null : id === seedAgent.id ? seedAgent : null;
  const agent = stored ?? seed;

  if (!hydrated) {
    return (
      <div className="page-container py-10">
        <div className="animate-pulse h-10 w-48 rounded-md bg-iron/30 mb-6" />
        <div className="animate-pulse h-72 rounded-2xl bg-iron/30" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="page-container py-10">
        <Link
          href="/agents"
          className="text-caption text-obsidian/60 hover:text-obsidian mb-6 inline-block"
        >
          ← Back to agents
        </Link>
        <FeatureCard surface="paper-white" padding="lg" className="hairline max-w-2xl">
          <p className="text-caption font-medium uppercase opacity-60 mb-2">
            Agent not found
          </p>
          <h1 className="text-heading font-bold mb-3">No agent with id “{id}”</h1>
          <p className="text-body-sm text-obsidian/70 mb-4">
            This agent isn't in your local store. It may have been created
            in a different browser or signed-in account, or it never
            finished saving. Go back to the agents list to see what you
            have, or compose a new one.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="light" size="sm" onClick={() => router.push("/agents")}>
              ← All agents
            </Button>
            <Button variant="outline-light" size="sm" onClick={() => router.push("/compose")}>
              ❖ Compose new
            </Button>
          </div>
        </FeatureCard>
      </div>
    );
  }

  // Render paths: stored agent vs seed agent
  const isStored = !!stored;
  const storedAgent = stored as AgentRecord | null;
  const meta =
    statusMeta[
      isStored
        ? storedAgent?.status ?? "active"
        : (seed as typeof seedAgent).status
    ];
  const linkedRuns = runs;

  // Progress: average of linked-run progress (only meaningful when
  // there are runs; otherwise show 0% rather than "0/0 done" which
  // looks broken).
  const progressPct = isStored
    ? linkedRuns.length > 0
      ? Math.round(
          linkedRuns.reduce((s, r) => s + (r.progress ?? 0), 0) / linkedRuns.length
        )
      : 0
    : Math.round(
        ((seed as typeof seedAgent).progress / (seed as typeof seedAgent).total) * 100
      );
  const completedRuns = linkedRuns.filter((r) => r.status === "completed").length;
  const name = isStored ? storedAgent?.name ?? "Untitled agent" : (seed as typeof seedAgent).name;
  const goal = isStored ? storedAgent?.goal ?? "" : (seed as typeof seedAgent).goal;
  const parent = isStored ? "Auto-composed by Skill Manager" : (seed as typeof seedAgent).parent;
  const spawnedAt = isStored
    ? new Date(storedAgent?.createdAt ?? Date.now()).toLocaleString()
    : (seed as typeof seedAgent).spawnedAt;
  const skills = isStored
    ? (storedAgent?.subtasks ?? []).map((s) => s.matchedSkill).filter(Boolean)
    : (seed as typeof seedAgent).skills;
  const subtasks = isStored ? storedAgent?.subtasks ?? [] : [];

  // Find the most recent completed run with action data — that's the
  // best candidate for a skill.md export. Fall back to the most
  // recent run of any status.
  const exportableRun =
    linkedRuns.find(
      (r) => r.status === "completed" && (r.actions?.length ?? 0) > 0
    ) ?? linkedRuns[0] ?? null;

  const handleExportSkill = () => {
    if (!exportableRun) return;
    downloadSkillMd(exportableRun, storedAgent);
  };

  const handleExportSkillPack = () => {
    if (!exportableRun) return;
    downloadSkillPack(exportableRun, storedAgent);
  };

  const [reDispatching, setReDispatching] = React.useState(false);
  const handleReDispatch = async () => {
    if (!isStored || !storedAgent?.goal) return;
    if (reDispatching) return;
    setReDispatching(true);
    try {
      const { saveRun, appendLog } = await import("@/lib/client/stores");
      const { startRunSimulator } = await import("@/lib/client/run-simulator");
      const { startBrowserRunner } = await import("@/lib/client/browser-runner");
      const localAgent = storedAgent;
      const res = await fetch("/api/agents/run-autonomous", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: localAgent.goal, inputCount: 5 }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        runId?: string;
        browserStops?: Array<{ url: string; site: string; label: string }>;
        error?: string;
      };
      if (!res.ok || !data.runId) {
        throw new Error(data.error ?? `Re-dispatch failed: ${res.status}`);
      }
      const newRun = {
        id: data.runId,
        skillId: localAgent.id,
        skillName: localAgent.name,
        agentId: localAgent.id,
        goal: localAgent.goal,
        inputs: Array.from({ length: 5 }, (_, i) => ({
          id: `input_${i + 1}`,
          payload: { row: i + 1 },
        })),
        totalInputs: 5,
        status: "running" as const,
        progress: 0,
        startedAt: new Date().toISOString(),
        gcp: "disabled" as const,
        message: "Re-dispatched from agent page.",
      };
      saveRun(userId, newRun);
      appendLog(userId, {
        level: "action",
        agent: "echo-manager",
        scope: data.runId,
        msg: `Re-dispatched from agent ${localAgent.id}`,
      });
      startRunSimulator({ userId, runId: data.runId, totalInputs: 5, goal: localAgent.goal });
      if (data.browserStops?.length) {
        startBrowserRunner({ userId, runId: data.runId, stops: data.browserStops });
      }
      router.push(`/runs/${data.runId}`);
    } catch (err) {
      console.error("Re-dispatch failed:", err);
      setReDispatching(false);
    }
  };

  return (
    <div className="page-container py-10">
      <Link
        href="/agents"
        className="text-caption text-obsidian/60 hover:text-obsidian mb-6 inline-block"
      >
        ← Back to agents
      </Link>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <FeatureTag variant={meta.color}>
              {meta.symbol} {meta.label}
            </FeatureTag>
            <FeatureTag variant="iron">
              {isStored ? "Saved agent" : "Demo seed"}
            </FeatureTag>
            {isStored && storedAgent && (
              <code className="text-caption font-mono text-obsidian/50">
                {storedAgent.id}
              </code>
            )}
          </div>
          <h1 className="text-display-md font-bold">{name}</h1>
          <p className="mt-3 text-body text-obsidian/70 max-w-2xl">{goal}</p>
          <p className="mt-2 text-caption text-obsidian/50">
            {parent} · Started {spawnedAt}
          </p>
        </div>
        {/* Pause / Stop are demo affordances for the seed agent. Real
            saved agents don't have a worker process the user can
            pause yet (Cloud Run worker/browser weren't deployed in
            this demo) so we hide the controls rather than render
            dead buttons. For saved agents, the Re-dispatch button
            lets the user fire the same goal again. */}
        {isStored ? (
          <div className="flex gap-3">
            <Button
              variant="light"
              size="md"
              onClick={handleReDispatch}
              disabled={reDispatching}
              title="Re-dispatch the same goal with a fresh runId"
            >
              {reDispatching ? "⟳ Re-dispatching…" : "▶ Re-dispatch"}
            </Button>
          </div>
        ) : (
          <div className="flex gap-3">
            <Button variant="outline-light" size="md">
              ⏸ Pause
            </Button>
            <Button variant="light" size="md">
              ⏹ Stop
            </Button>
          </div>
        )}
      </div>

      {/* Progress hero */}
      <FeatureCard
        surface={isStored ? "obsidian" : "deep-teal"}
        padding="lg"
        className="text-paper-white mb-8"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-caption text-paper-white/60 uppercase tracking-wider">
            {isStored ? `Linked runs (${linkedRuns.length})` : "Progress"}
          </span>
          <span className="text-heading font-bold tabular-nums">
            {isStored
              ? linkedRuns.length > 0
                ? `${completedRuns}/${linkedRuns.length} done`
                : "0%"
              : `${(seed as typeof seedAgent).progress} / ${(seed as typeof seedAgent).total}`}
          </span>
        </div>
        <div className="h-2 bg-paper-white/10 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-paper-white rounded-full"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-caption text-paper-white/70">
          <span>{progressPct}% complete</span>
          <span>
            {isStored
              ? linkedRuns.length > 0
                ? `Last activity: ${new Date(linkedRuns[0].startedAt).toLocaleString()}`
                : "Dispatch a run to start tracking activity"
              : `ETA: ${(seed as typeof seedAgent).eta}`}
          </span>
        </div>
      </FeatureCard>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sub-tasks OR live trace */}
        <div className="lg:col-span-2 space-y-6">
          {isStored && subtasks.length > 0 && (
            <div>
              <h2 className="text-heading-sm font-bold mb-4">Sub-tasks</h2>
              <div className="space-y-2">
                {subtasks.map((s) => (
                  <FeatureCard
                    key={s.num}
                    surface="paper-white"
                    padding="md"
                    className="hairline"
                  >
                    <div className="flex items-center gap-3">
                      <div className="shrink-0 w-8 h-8 rounded-full bg-obsidian text-paper-white text-caption font-bold flex items-center justify-center">
                        {s.num}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-body-sm font-medium truncate">
                          {s.title}
                        </p>
                        <p className="text-caption text-obsidian/50">
                          Uses skill: <em>{s.matchedSkill}</em>
                          {s.parallel ? " · parallel" : ""} · ~{s.estTime}
                        </p>
                      </div>
                    </div>
                  </FeatureCard>
                ))}
              </div>
            </div>
          )}

          {!isStored && (
            <>
              <h2 className="text-heading-sm font-bold">Live execution trace</h2>
              <FeatureCard surface="obsidian" padding="md" className="font-mono text-caption">
                <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                  {(seed as typeof seedAgent).trace.map((t, i) => {
                    const color =
                      t.level === "success"
                        ? "text-emerald-400"
                        : t.level === "warn"
                          ? "text-amber-400"
                          : t.level === "action"
                            ? "text-sky-300"
                            : "text-paper-white/60";
                    return (
                      <div key={i} className="flex gap-3">
                        <span className="text-paper-white/30 tabular-nums shrink-0">
                          {t.ts}
                        </span>
                        <span className={color}>{t.step}</span>
                      </div>
                    );
                  })}
                  <div className="flex gap-3 mt-2 text-paper-white/40">
                    <span className="tabular-nums">11:42:34</span>
                    <span className="animate-pulse">▍</span>
                  </div>
                </div>
              </FeatureCard>
            </>
          )}

          {/* Linked runs (only for stored agents) */}
          {isStored && linkedRuns.length > 0 && (
            <div>
              <h2 className="text-heading-sm font-bold mb-4">Recent runs</h2>
              <div className="space-y-2">
                {linkedRuns.slice(0, 8).map((r) => (
                  <Link
                    key={r.id}
                    href={`/runs/${r.id}`}
                    className="block"
                  >
                    <FeatureCard
                      surface="paper-white"
                      padding="md"
                      className="hairline hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-caption font-mono text-obsidian/60 truncate">
                            {r.id}
                          </p>
                          <p className="text-body-sm text-obsidian/80 truncate">
                            {r.goal ?? "(no goal)"}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-caption text-obsidian/50">
                            {r.status} · {r.progress}%
                          </p>
                          <p className="text-caption text-obsidian/40">
                            {new Date(r.startedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </FeatureCard>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {isStored && linkedRuns.length === 0 && (
            <FeatureCard surface="paper-white" padding="md" className="hairline">
              <p className="text-caption text-obsidian/60">
                No runs have been linked to this agent yet. Dispatch the
                composer to start one.
              </p>
            </FeatureCard>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {skills.length > 0 && (
            <FeatureCard surface="paper-white" padding="md" className="hairline">
              <h3 className="text-caption font-medium uppercase opacity-60 mb-3">
                Skills in use
              </h3>
              <ul className="space-y-2">
                {skills.map((s, i) => (
                  <li
                    key={s + i}
                    className="flex items-center gap-3 text-body-sm"
                  >
                    <span className="w-6 h-6 rounded-full bg-obsidian text-paper-white flex items-center justify-center text-caption font-bold shrink-0">
                      {i + 1}
                    </span>
                    <span className="font-medium">{s}</span>
                  </li>
                ))}
              </ul>
            </FeatureCard>
          )}

          <FeatureCard surface="dusty-sky" padding="md">
            <h3 className="text-caption font-medium uppercase opacity-60 mb-2">
              Take over
            </h3>
            <p className="text-body-sm mb-3">
              Need to manually handle this run? Take over the agent and Echo
              will pause until you release control.
            </p>
            <Button variant="light" size="sm" className="w-full">
              Take over
            </Button>
          </FeatureCard>

          <FeatureCard surface="wisteria" padding="md">
            <h3 className="text-caption font-medium uppercase opacity-60 mb-2">
              Save as skill
            </h3>
            <p className="text-body-sm mb-3">
              {exportableRun
                ? "Download a portable skill.md file with the goal, procedure, rules, output schema, and validation. Drop it into any Echo workspace to re-run."
                : "No runs yet — dispatch a goal from the Composer first, then come back to export it as a reusable skill."}
            </p>
            <div className="space-y-2">
              <Button
                variant="light"
                size="sm"
                className="w-full"
                disabled={!exportableRun}
                onClick={handleExportSkill}
                title={
                  exportableRun
                    ? `Download skill.md for run ${exportableRun.id.slice(-12)}`
                    : "No run available to export"
                }
              >
                ↓ Download skill.md
              </Button>
              {subtasks.length > 1 && (
                <Button
                  variant="outline-light"
                  size="sm"
                  className="w-full"
                  disabled={!exportableRun}
                  onClick={handleExportSkillPack}
                  title={`Download ${subtasks.length} per-subtask skill.md files plus a manifest`}
                >
                  ↓ Download skill pack ({subtasks.length} files)
                </Button>
              )}
            </div>
            {exportableRun && (
              <p className="mt-2 text-[10px] text-obsidian/50 text-center">
                From run <code className="font-mono">{exportableRun.id.slice(-12)}</code>
              </p>
            )}
          </FeatureCard>
        </div>
      </div>
    </div>
  );
}
