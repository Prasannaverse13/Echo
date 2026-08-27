"use client";

/**
 * Runs-page WebMCP tools.
 *
 * Exposed on `/runs`. Lets an in-browser agent query run history and
 * live status, mark a running run as cancelled, and pull aggregate
 * stats. All read-only except `cancel_run` (which only updates the
 * local mirror — server-side cancellation would need a separate
 * endpoint we don't ship yet).
 */

import type { WebMCPToolDefinition } from "./types";
import { getRun, listRuns, getUserId, updateRun, type RunRecord } from "@/lib/client/stores";

const RUN_STATUSES = ["queued", "running", "completed", "failed", "review", "cancelled"] as const;
type RunStatus = (typeof RUN_STATUSES)[number];

function toSummary(r: RunRecord) {
  return {
    id: r.id,
    goal: r.goal?.slice(0, 160),
    skillName: r.skillName,
    status: r.status,
    progress: r.progress,
    totalInputs: r.totalInputs,
    startedAt: r.startedAt,
    finishedAt: r.finishedAt,
    durationSec: r.durationSec,
    gcp: r.gcp,
  };
}

export function buildRunsTools(): WebMCPToolDefinition[] {
  const userId = getUserId();

  return [
    {
      name: "list_runs",
      title: "List runs",
      description:
        "List Echo runs from local storage, optionally filtered by status. Returns the most recent N runs.",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: [...RUN_STATUSES],
            description: "Filter to runs in this status. Omit for all.",
          },
          limit: {
            type: "number",
            minimum: 1,
            maximum: 50,
            description: "Max runs to return. Default 10.",
          },
        },
      },
      annotations: { readOnlyHint: true },
      execute: ({ status, limit }) => {
        const all = listRuns(userId);
        const filtered = status ? all.filter((r) => r.status === status) : all;
        const n = Math.max(1, Math.min(50, Number(limit) || 10));
        return {
          count: filtered.length,
          returned: Math.min(n, filtered.length),
          runs: filtered.slice(0, n).map(toSummary),
        };
      },
    },
    {
      name: "get_run",
      title: "Get run",
      description:
        "Fetch the full details of a specific run including inputs, plan, status, and timing.",
      inputSchema: {
        type: "object",
        properties: { runId: { type: "string", description: "The run id." } },
        required: ["runId"],
      },
      annotations: { readOnlyHint: true },
      execute: ({ runId }) => {
        const r = getRun(userId, String(runId));
        if (!r) throw new Error(`run ${runId} not found in local storage`);
        return r;
      },
    },
    {
      name: "get_run_stats",
      title: "Run stats",
      description:
        "Aggregate stats across all runs: count by status, total inputs processed, last activity, success rate.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => {
        const all = listRuns(userId);
        const byStatus = all.reduce<Record<string, number>>((acc, r) => {
          acc[r.status] = (acc[r.status] ?? 0) + 1;
          return acc;
        }, {});
        const totalInputs = all.reduce((sum, r) => sum + (r.totalInputs || 0), 0);
        const completed = byStatus.completed ?? 0;
        const failed = byStatus.failed ?? 0;
        const done = completed + failed;
        return {
          total: all.length,
          byStatus,
          totalInputs,
          lastRunAt: all[0]?.startedAt ?? null,
          successRate: done > 0 ? completed / done : null,
        };
      },
    },
    {
      name: "find_runs_by_goal",
      title: "Find runs by goal",
      description:
        "Search runs whose goal text contains the given substring (case-insensitive). Returns the most recent N matches.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Substring to search for in the goal." },
          limit: { type: "number", minimum: 1, maximum: 50, description: "Max matches. Default 5." },
        },
        required: ["query"],
      },
      annotations: { readOnlyHint: true },
      execute: ({ query, limit }) => {
        const q = String(query).toLowerCase();
        const all = listRuns(userId);
        const matches = all.filter((r) => (r.goal ?? "").toLowerCase().includes(q));
        const n = Math.max(1, Math.min(50, Number(limit) || 5));
        return {
          count: matches.length,
          runs: matches.slice(0, n).map(toSummary),
        };
      },
    },
    {
      name: "cancel_run",
      title: "Cancel run",
      description:
        "Mark a running or queued run as cancelled in the local mirror. This updates the UI immediately; the server-side worker will continue to drain any inputs already in flight, but no new ones will start.",
      inputSchema: {
        type: "object",
        properties: { runId: { type: "string" } },
        required: ["runId"],
      },
      annotations: { readOnlyHint: false },
      execute: ({ runId }) => {
        const r = getRun(userId, String(runId));
        if (!r) throw new Error(`run ${runId} not found`);
        if (r.status === "completed" || r.status === "failed" || r.status === "cancelled") {
          throw new Error(`run ${runId} is already ${r.status} — nothing to cancel`);
        }
        updateRun(userId, String(runId), {
          status: "cancelled",
          finishedAt: new Date().toISOString(),
          message: "Cancelled via WebMCP tool.",
        });
        return { ok: true, runId: r.id, newStatus: "cancelled" };
      },
    },
  ];
}
