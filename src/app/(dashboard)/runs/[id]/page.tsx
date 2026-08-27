"use client";

import * as React from "react";
import { FeatureCard, FeatureTag, Button } from "@/components/ui";
import { BrowserConsole } from "@/components/BrowserConsole";
import {
  getAgent,
  getUserId,
  type AgentRecord,
  type RunRecord,
} from "@/lib/client/stores";
import { downloadSkillMd } from "@/lib/client/skill-md";

const POLL_MS = 1500;

const variantByStatus: Record<
  RunRecord["status"],
  "mist-mint" | "desert-clay" | "iron" | "obsidian" | "wisteria"
> = {
  review: "desert-clay",
  failed: "iron",
  running: "wisteria",
  queued: "obsidian",
  completed: "mist-mint",
  cancelled: "iron",
};

function formatDuration(startedAt: string, finishedAt?: string) {
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export default function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = React.useMemo(getUserId, []);
  const [run, setRun] = React.useState<RunRecord | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const [id, setId] = React.useState<string>("");
  const [agent, setAgent] = React.useState<AgentRecord | null>(null);

  // Next.js 15 app router: params is a Promise. Resolve it client-side.
  React.useEffect(() => {
    let alive = true;
    params.then((p) => {
      if (alive) setId(p.id);
    });
    return () => {
      alive = false;
    };
  }, [params]);

  // Live refresh from localStorage (the worker streams progress into the
  // same store the runs page reads from).
  React.useEffect(() => {
    if (!id) return;
    const refresh = async () => {
      const { getRun } = await import("@/lib/client/stores");
      const fresh = getRun(userId, id) ?? null;
      setRun(fresh);
      if (fresh?.agentId) {
        setAgent(getAgent(userId, fresh.agentId) ?? null);
      }
    };
    refresh();
    const interval = setInterval(refresh, POLL_MS);
    return () => clearInterval(interval);
  }, [userId, id]);

  // Tick every second so the elapsed timer refreshes while the run is
  // still in flight.
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!id) {
    return (
      <div className="page-container py-10">
        <FeatureCard surface="paper-white" padding="lg" className="hairline text-center">
          <p className="text-body text-obsidian/60">Loading run…</p>
        </FeatureCard>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="page-container py-10">
        <div className="mb-6">
          <a
            href="/runs"
            className="text-caption text-obsidian/60 hover:text-obsidian underline-offset-4 hover:underline"
          >
            ← All runs
          </a>
        </div>
        <FeatureCard surface="paper-white" padding="lg" className="hairline text-center">
          <p className="text-heading-sm font-bold mb-2">Run not found</p>
          <p className="text-body text-obsidian/60">
            We couldn't find a run with id <code className="font-mono">{id}</code> in
            this browser. If you dispatched it in another tab or signed-in as
            a different user, the run lives there.
          </p>
        </FeatureCard>
      </div>
    );
  }

  const isRunning = run.status === "running" || run.status === "queued";
  const elapsed = formatDuration(run.startedAt, run.finishedAt);

  return (
    <div className="page-container py-10">
      <div className="mb-6">
        <a
          href="/runs"
          className="text-caption text-obsidian/60 hover:text-obsidian underline-offset-4 hover:underline"
        >
          ← All runs
        </a>
      </div>

      <div className="mb-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-caption text-obsidian/50 mb-2">Run</p>
          <h1 className="text-display-md font-bold font-mono break-all">
            {run.id}
          </h1>
          <p className="mt-2 text-body text-obsidian/70">
            {run.skillName ?? run.skillId} · {run.totalInputs} inputs · {elapsed} elapsed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FeatureTag variant={variantByStatus[run.status]}>
            {isRunning ? "● " : ""}
            {run.status}
          </FeatureTag>
          {run.gcp && (
            <FeatureTag variant={run.gcp === "connected" ? "mist-mint" : "iron"}>
              GCP {run.gcp}
            </FeatureTag>
          )}
        </div>
      </div>

      {/* Live progress */}
      <FeatureCard surface="paper-white" padding="lg" className="hairline mb-6">
        <div className="flex items-center justify-between text-caption font-medium uppercase opacity-60 mb-2">
          <span>Progress</span>
          <span className="tabular-nums">
            {isRunning
              ? run.progress > 0
                ? `${run.progress}%`
                : "starting…"
              : `${run.progress ?? 0}%`}
          </span>
        </div>
        <div className="h-2 bg-iron rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-obsidian transition-all duration-500"
            style={{ width: `${Math.min(100, run.progress ?? 0)}%` }}
          />
        </div>
        <p className="text-body-sm text-obsidian/70">
          {isRunning ? (
            <>
              <span className="inline-block w-2 h-2 rounded-full bg-wisteria mr-2 animate-pulse" />
              Echo is driving the headless browser and streaming results into
              Firestore. This page updates automatically.
            </>
          ) : run.status === "completed" ? (
            <>All {run.totalInputs} inputs finished. See the inputs below for per-row output.</>
          ) : run.status === "failed" ? (
            <>The run hit an error and stopped. Check the agent or your GCP wiring.</>
          ) : run.status === "cancelled" ? (
            <>This run was cancelled before it could finish.</>
          ) : (
            <>Pending — the worker hasn't picked it up yet.</>
          )}
        </p>
        {run.message && (
          <p className="mt-3 text-caption text-obsidian/60 italic">
            "{run.message}"
          </p>
        )}
      </FeatureCard>

      {/* Live browser console — the agent's action stream */}
      <div className="mb-6">
        <h2 className="text-heading-sm font-bold mb-3">Browser console</h2>
        <BrowserConsole
          actions={run.actions}
          currentUrl={run.currentUrl}
          status={run.status}
        />
      </div>

      {/* Goal + agent */}
      {run.goal && (
        <FeatureCard surface="sandstone" padding="md" className="hairline mb-6">
          <p className="text-caption font-medium uppercase opacity-60 mb-2">
            Goal
          </p>
          <p className="text-body leading-relaxed">{run.goal}</p>
        </FeatureCard>
      )}

      {run.agentId && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Button variant="outline-light" size="md" href={`/agents/${run.agentId}`}>
            View agent →
          </Button>
          {/* skill.md export — available on every run, not just
              completed ones, so the user can also save a partial
              trace for debugging. */}
          <Button
            variant="light"
            size="md"
            onClick={() => downloadSkillMd(run, agent)}
            title="Download a portable skill.md file containing the goal, plan, action log, and inline screenshots"
          >
            ↓ Download skill.md
          </Button>
        </div>
      )}

      {/* Per-input list */}
      <div>
        <h2 className="text-heading-sm font-bold mb-3">Inputs</h2>
        <FeatureCard surface="paper-white" padding="md" className="hairline overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-iron">
                <th className="text-caption font-medium uppercase opacity-60 py-3">#</th>
                <th className="text-caption font-medium uppercase opacity-60 py-3">Input</th>
                <th className="text-caption font-medium uppercase opacity-60 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {run.inputs.map((inp, i) => (
                <tr key={inp.id} className="border-b border-iron last:border-0">
                  <td className="py-3 text-caption tabular-nums text-obsidian/60">{i + 1}</td>
                  <td className="py-3 text-caption font-mono text-obsidian/80">
                    {inp.id}
                  </td>
                  <td className="py-3">
                    {isRunning ? (
                      <span className="text-caption text-obsidian/60">pending</span>
                    ) : (
                      <span className="text-caption text-mist-mint">done</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </FeatureCard>
      </div>
    </div>
  );
}
