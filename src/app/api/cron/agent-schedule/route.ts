import { NextRequest, NextResponse } from "next/server";
import { readCollection, writeDoc, isGcpAvailable } from "@/lib/gcp";
import { nextRunFromCron } from "@/app/api/agents/schedule/route";

/**
 * GET /api/cron/agent-schedule
 *
 * Vercel Cron calls this every hour (see vercel.json). It:
 *   1. Reads all schedules from Firestore (`schedules/*`)
 *   2. Picks the ones whose `nextRunAt <= now` and `enabled === true`
 *   3. For each, publishes a `run.created` event to the echo-runs
 *      Pub/Sub topic (same channel the on-demand /api/agents/run
 *      uses), then updates the schedule's `lastRunAt` and recomputes
 *      `nextRunAt` from the cron expression.
 *
 * Auth: Vercel automatically signs requests to `/api/cron/*` with
 * `x-vercel-cron` header. We could check that here for extra safety,
 * but Vercel Hobby doesn't allow IP allow-lists, so the cron header
 * is the recommended signal. For dev, you can also hit this endpoint
 * directly with `curl http://localhost:3000/api/cron/agent-schedule`.
 *
 * Idempotency: if the same schedule fires twice in the same minute
 * (e.g. Vercel retries a 502), the second run sees `lastRunAt` is
 * already within the current minute and skips.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ScheduleDoc {
  id: string;
  userId: string;
  name: string;
  goal: string;
  cron: string;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  lastRunId?: string;
  nextRunAt?: string;
  inputsFetcher?: { kind: "static"; values: unknown[] } | { kind: "url"; url: string };
}

export async function GET(req: NextRequest) {
  if (!isGcpAvailable()) {
    return NextResponse.json(
      {
        ok: true,
        source: "noop",
        note: "GCP not configured — schedules are demo-only. Set GCP_ENABLED=true + service account JSON in env to enable cron firings.",
      },
      { status: 200 }
    );
  }

  const all = (await readCollection("schedules").catch(() => [])) as ScheduleDoc[];
  const now = new Date();
  const fired: Array<{ id: string; runId: string; scheduleName: string }> = [];
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const s of all) {
    if (!s.enabled) {
      skipped.push({ id: s.id, reason: "disabled" });
      continue;
    }
    // Idempotency: if lastRunAt is within the current minute, skip
    if (s.lastRunAt) {
      const lastMs = new Date(s.lastRunAt).getTime();
      if (now.getTime() - lastMs < 60_000) {
        skipped.push({ id: s.id, reason: "already ran this minute" });
        continue;
      }
    }
    // Recompute nextRunAt if missing or stale
    let nextAt = s.nextRunAt ? new Date(s.nextRunAt) : null;
    if (!nextAt || nextAt.getTime() <= now.getTime() - 60_000) {
      nextAt = nextRunFromCron(s.cron, now);
      await writeDoc("schedules", s.id, { nextRunAt: nextAt.toISOString() } as unknown as Record<string, unknown>).catch(
        () => undefined
      );
    }
    if (nextAt.getTime() > now.getTime() + 60_000) {
      skipped.push({ id: s.id, reason: "not due" });
      continue;
    }

    // Time to fire. Compose + run in a single shot: pick a single
    // input (or the first static one), publish run.created, and let
    // the worker take it from there.
    const inputs = pickInputs(s);
    if (inputs.length === 0) {
      skipped.push({ id: s.id, reason: "no inputs available" });
      continue;
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Persist the run doc up front so the worker can pick it up
    await writeDoc("runs", runId, {
      runId,
      skillId: `sched_${s.id}`,
      agentId: null,
      goal: s.goal,
      totalInputs: inputs.length,
      inputs: inputs.map((p, i) => ({ id: `${runId}-input-${i + 1}`, payload: p })),
      status: "queued",
      startedAt: new Date().toISOString(),
      scheduledBy: s.id,
      skill: null, // the worker will pick the plan from a re-compose call
    } as unknown as Record<string, unknown>).catch(() => undefined);

    // Also persist a tiny marker on the schedule
    await writeDoc("schedules", s.id, {
      lastRunAt: now.toISOString(),
      lastRunId: runId,
      nextRunAt: nextRunFromCron(s.cron, now).toISOString(),
    } as unknown as Record<string, unknown>).catch(() => undefined);

    // Publish to the same Pub/Sub topic as on-demand runs
    try {
      const { publishRunEvent } = await import("@/lib/gcp");
      await publishRunEvent({
        eventType: "run.created",
        runId,
        skillId: `sched_${s.id}`,
        totalInputs: inputs.length,
        scheduledBy: s.id,
        createdAt: now.toISOString(),
      } as unknown as Record<string, unknown> & { eventType: string; runId: string });
    } catch {
      // If Pub/Sub publish fails, the run is still in Firestore — the
      // worker will pick it up on its next drain.
    }

    fired.push({ id: s.id, runId, scheduleName: s.name });
  }

  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    fired,
    skipped,
    total: all.length,
  });
}

function pickInputs(s: ScheduleDoc): Record<string, unknown>[] {
  if (s.inputsFetcher?.kind === "static") {
    const vals = s.inputsFetcher.values ?? [];
    return vals.length > 0
      ? vals.map((v) => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : { value: v }))
      : [{ scheduleId: s.id, name: s.name, goal: s.goal }];
  }
  // For URL-fetched or unset: a single synthetic input for now. The
  // worker can re-fetch on each invocation.
  return [{ scheduleId: s.id, name: s.name, goal: s.goal }];
}
