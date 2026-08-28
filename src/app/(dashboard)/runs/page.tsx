"use client";

import * as React from "react";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";
import {
  clearRuns,
  getUserId,
  listRuns,
  type RunRecord,
} from "@/lib/client/stores";
import { buildRunsTools } from "@/lib/webmcp/runs-tools";
import { useWebMCPTools } from "@/lib/webmcp/use-webmcp";

const statusFilter = ["all", "success", "failed", "review", "running", "queued", "cancelled"] as const;
type StatusFilter = (typeof statusFilter)[number];

const variantByStatus: Record<RunRecord["status"], "mist-mint" | "desert-clay" | "iron" | "obsidian" | "wisteria"> = {
  review: "desert-clay",
  failed: "iron",
  running: "wisteria",
  queued: "obsidian",
  completed: "mist-mint",
  cancelled: "iron",
};

const POLL_MS = 1500;

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 5) return "just now";
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatDuration(startedAt: string, finishedAt?: string) {
  const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
  const sec = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export default function RunsPage() {
  const userId = React.useMemo(getUserId, []);
  const [runs, setRuns] = React.useState<RunRecord[]>([]);
  const [filter, setFilter] = React.useState<StatusFilter>("all");
  const [now, setNow] = React.useState(Date.now());
  const [highlightId, setHighlightId] = React.useState<string | null>(null);

  // Initial load + live polling
  React.useEffect(() => {
    setRuns(listRuns(userId));
    const refresh = () => setRuns(listRuns(userId));
    const id = setInterval(refresh, POLL_MS);
    const onLocal = () => setRuns(listRuns(userId));
    window.addEventListener("echo:store:runs", onLocal as EventListener);
    return () => {
      clearInterval(id);
      window.removeEventListener("echo:store:runs", onLocal as EventListener);
    };
  }, [userId]);

  // Deep-link from the composer (?runId=xxx): pre-select the run's status
  // filter so it's guaranteed to be in the visible list, then highlight +
  // scroll the matching row into view.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const runId = params.get("runId");
    if (!runId) return;
    setHighlightId(runId);
    // Wait a tick for the table to render, then scroll.
    const t = setTimeout(() => {
      const el = document.getElementById(`run-row-${runId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [runs]);

  // For "running" rows: re-render every second so the elapsed timer ticks
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const counts = React.useMemo(() => {
    const c = {
      all: runs.length,
      success: 0,
      failed: 0,
      review: 0,
      running: 0,
      queued: 0,
      cancelled: 0,
    };
    for (const r of runs) {
      if (r.status === "completed") c.success += 1;
      else if (r.status === "failed") c.failed += 1;
      else if (r.status === "review") c.review += 1;
      else if (r.status === "running") c.running += 1;
      else if (r.status === "queued") c.queued += 1;
      else if (r.status === "cancelled") c.cancelled += 1;
    }
    return c;
  }, [runs, now]);

  const visible = runs.filter((r) => {
    if (filter === "all") return true;
    if (filter === "success") return r.status === "completed";
    if (filter === "review") return r.status === "review";
    if (filter === "running") return r.status === "running";
    if (filter === "queued") return r.status === "queued";
    if (filter === "failed") return r.status === "failed";
    if (filter === "cancelled") return r.status === "cancelled";
    return true;
  });

  // WebMCP: expose read-mostly run history tools to in-browser agents.
  const runsTools = React.useMemo(() => buildRunsTools(), []);
  useWebMCPTools(runsTools);

  const exportCsv = () => {
    if (typeof window === "undefined") return;
    const header = ["run_id", "skill", "status", "total_inputs", "progress", "started_at", "finished_at", "duration_sec"];
    const rows = visible.map((r) => [
      r.id,
      r.skillName ?? r.skillId,
      r.status,
      r.totalInputs,
      r.progress,
      r.startedAt,
      r.finishedAt ?? "",
      r.durationSec ?? "",
    ]);
    const csv = [header, ...rows]
      .map((cells) => cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `echo-runs-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page-container py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <p className="text-caption text-obsidian/50 mb-2">History</p>
          <h1 className="text-display-md font-bold">All runs</h1>
          <p className="mt-2 text-body text-obsidian/70 tabular-nums">
            {counts.all} total · {counts.success} completed · {counts.failed} failed · {counts.review} needs review ·{" "}
            {counts.running + counts.queued} in flight
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline-light" size="md" onClick={exportCsv}>
            ↓ Export CSV
          </Button>
          {runs.length > 0 && (
            <Button
              variant="outline-light"
              size="md"
              onClick={() => {
                if (confirm("Clear all run history? This cannot be undone.")) clearRuns(userId);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {statusFilter.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-caption font-medium transition-colors ${
              filter === s ? "bg-obsidian text-paper-white" : "bg-bone text-obsidian hover:bg-iron"
            }`}
          >
            {s} · {counts[s]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <FeatureCard surface="paper-white" padding="lg" className="hairline text-center">
          <p className="text-heading-sm font-bold mb-2">
            {runs.length === 0 ? "No runs yet" : "No runs match this filter"}
          </p>
          <p className="text-body text-obsidian/60 mb-5">
            {runs.length === 0
              ? "Dispatch your first agent from the Composer — it'll show up here with live progress and a screenshot from the real headless browser."
              : "Try a different status filter, or clear the filter to see everything."}
          </p>
          {runs.length === 0 ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button variant="light" size="md" href="/compose">
                ❖ Compose an agent
              </Button>
              <Button variant="outline-light" size="md" href="/compose?demo=true">
                ▶ Run the demo
              </Button>
            </div>
          ) : (
            <Button variant="outline-light" size="md" onClick={() => setFilter("all")}>
              Show all runs
            </Button>
          )}
        </FeatureCard>
      ) : (
        <FeatureCard surface="paper-white" padding="md" className="hairline overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-iron">
                <th className="text-caption font-medium uppercase opacity-60 py-3">Run</th>
                <th className="text-caption font-medium uppercase opacity-60 py-3">Skill</th>
                <th className="text-caption font-medium uppercase opacity-60 py-3">Inputs</th>
                <th className="text-caption font-medium uppercase opacity-60 py-3">Real</th>
                <th className="text-caption font-medium uppercase opacity-60 py-3">Status</th>
                <th className="text-caption font-medium uppercase opacity-60 py-3">Progress</th>
                <th className="text-caption font-medium uppercase opacity-60 py-3">Duration</th>
                <th className="text-caption font-medium uppercase opacity-60 py-3">When</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((run) => {
                const isHighlighted = highlightId === run.id;
                return (
                <tr
                  key={run.id}
                  id={`run-row-${run.id}`}
                  onClick={() => (window.location.href = `/runs/${run.id}`)}
                  className={`border-b border-iron last:border-0 cursor-pointer transition-colors ${
                    isHighlighted
                      ? "bg-wisteria/10 ring-1 ring-wisteria/40"
                      : "hover:bg-bone/50"
                  }`}
                >
                  <td className="py-3 text-caption font-mono">{run.id.slice(0, 14)}</td>
                  <td className="py-3 text-body-sm font-medium">{run.skillName ?? run.skillId}</td>
                  <td className="py-3 text-body-sm text-obsidian/70 tabular-nums">{run.totalInputs}</td>
                  <td className="py-3">
                    {(() => {
                      const realCount = (run.actions ?? []).filter((a) => a.real).length;
                      if (realCount === 0) return <span className="text-caption text-obsidian/40">—</span>;
                      return (
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-mist-mint/40 text-[10px] font-bold text-obsidian/70"
                          title={`${realCount} real headless Chromium action(s)`}
                        >
                          📸 {realCount}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-3">
                    <FeatureTag variant={variantByStatus[run.status]}>
                      {run.status === "running" || run.status === "queued" ? "● " : ""}
                      {run.status}
                    </FeatureTag>
                  </td>
                  <td className="py-3">
                    {run.status === "running" || run.status === "queued" ? (
                      <div className="flex items-center gap-2 w-32">
                        <div className="flex-1 h-1.5 bg-iron rounded-full overflow-hidden">
                          <div
                            className="h-full bg-obsidian transition-all duration-300"
                            style={{ width: `${Math.min(100, run.progress)}%` }}
                          />
                        </div>
                        <span className="text-caption tabular-nums text-obsidian/60 w-8 text-right">
                          {Math.min(100, run.progress)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-caption text-obsidian/50">—</span>
                    )}
                  </td>
                  <td className="py-3 text-body-sm tabular-nums text-obsidian/70">
                    {formatDuration(run.startedAt, run.finishedAt)}
                  </td>
                  <td className="py-3 text-caption text-obsidian/60">{relativeTime(run.startedAt)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </FeatureCard>
      )}
    </div>
  );
}
