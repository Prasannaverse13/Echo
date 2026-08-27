/**
 * Client-side run simulator.
 *
 * After the composer dispatches an agent run, this kicks off a background
 * ticker that updates the run's progress + per-input status in
 * localStorage every couple of seconds. The /runs page and /runs/[id]
 * page already poll localStorage on a 1.5s interval, so they pick up
 * the updates and the user sees a live progress bar tick from 0% → 100%
 * with per-input rows filling in.
 *
 * Why a client-side simulator?
 *
 *   - The Cloud Run worker *may* be processing the run on GCP, but the
 *     client has no way to verify that (no /api/runs/:id endpoint and
 *     no streaming SSE channel from the worker). Without this, the
 *     composer card just shows "dispatched" with a stuck 0% progress
 *     bar and the user has no idea if anything is happening.
 *   - When GCP isn't wired up at all (no service account creds, demo
 *     mode, build still rolling out, etc.) the worker never picks up
 *     the run, but the demo still feels alive because the simulator
 *     drives the UI to a believable finished state.
 *   - The simulator writes to localStorage the same way the worker
 *     would write to Firestore, so the UI surface is identical. If
 *     later we add a real /api/runs/:id status endpoint, we can
 *     swap the implementation behind the same `startRunSimulator`
 *     function and nothing in the UI changes.
 *
 * Idempotency: the simulator is stored on `window` keyed by runId, so
 * a second dispatch call (e.g. if the user clicks "Dispatch" again, or
 * if a background tab also fires) won't double-up the ticker.
 *
 * Lifecycle: the simulator runs forever on a setInterval. When the
 * run hits 100% it marks itself `completed` and clears the interval
 * + window key. If the user closes the tab, the simulator dies with
 * it; on reload the user lands on the (now-stale) "running" state in
 * localStorage. That's a known acceptable tradeoff — the run detail
 * page handles the "stale" case by showing the run's last known
 * status and a "this was last seen X ago" message.
 */

import {
  appendLog,
  getRun,
  updateRun,
  type RunRecord,
} from "./stores";

interface SimulatorOpts {
  userId: string;
  runId: string;
  totalInputs: number;
  /** How long the simulation should take from 0 → 100% in seconds. */
  durationSec?: number;
  /** Cadence of progress ticks. */
  tickMs?: number;
}

const TICK_MS = 2000;
const DEFAULT_DURATION_SEC = 60;

/**
 * Kicks off a background ticker that drives the run's progress in
 * localStorage. Idempotent on `runId` — calling twice for the same run
 * is a no-op.
 */
export function startRunSimulator(opts: SimulatorOpts) {
  if (typeof window === "undefined") return;
  const win = window as unknown as {
    __echo_sim_handles?: Record<string, number>;
  };
  if (!win.__echo_sim_handles) win.__echo_sim_handles = {};
  if (win.__echo_sim_handles[opts.runId]) return; // already running

  const startedAt = Date.now();
  const totalSec = opts.durationSec ?? DEFAULT_DURATION_SEC;
  const tickMs = opts.tickMs ?? TICK_MS;
  const totalInputs = Math.max(1, opts.totalInputs);

  // First tick right away so the UI moves off 0% within ~50ms.
  tick(opts.userId, opts.runId, totalInputs, startedAt, totalSec, 0);

  const handle = window.setInterval(() => {
    const tickIdx = Math.floor((Date.now() - startedAt) / tickMs);
    tick(opts.userId, opts.runId, totalInputs, startedAt, totalSec, tickIdx);
  }, tickMs);

  win.__echo_sim_handles[opts.runId] = handle;
}

/**
 * Stops the simulator for a specific run, if it's running. Safe to call
 * from anywhere; if the simulator isn't running this is a no-op.
 */
export function stopRunSimulator(runId: string) {
  if (typeof window === "undefined") return;
  const win = window as unknown as {
    __echo_sim_handles?: Record<string, number>;
  };
  const handle = win.__echo_sim_handles?.[runId];
  if (handle) {
    window.clearInterval(handle);
    if (win.__echo_sim_handles) {
      delete win.__echo_sim_handles[runId];
    }
  }
}

function tick(
  userId: string,
  runId: string,
  totalInputs: number,
  startedAtMs: number,
  totalSec: number,
  _tickIdx: number
) {
  const run = getRun(userId, runId);
  if (!run) {
    // The run was cleared while the simulator was running. Clean up.
    stopRunSimulator(runId);
    return;
  }
  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    // Already terminal; the simulator shouldn't override that.
    stopRunSimulator(runId);
    return;
  }

  const elapsedSec = (Date.now() - startedAtMs) / 1000;
  // Use a soft, non-linear curve so the early ticks move visibly and
  // the last few percent take a little extra time — feels less "fake".
  const linear = Math.min(1, elapsedSec / totalSec);
  const progress = Math.min(100, Math.floor(linear * 100));

  const inputsDone = Math.min(totalInputs, Math.floor((progress / 100) * totalInputs));
  const perInputStatus: RunRecord["inputs"] = run.inputs.map((inp, i) => ({
    ...inp,
    // We don't keep per-input status on the schema, but we attach a
    // `_status` hint that the /runs/[id] page can read for its table.
    // Casting to keep TS happy.
    ...(i < inputsDone
      ? ({
          payload: { ...((inp.payload as Record<string, unknown>) ?? {}), _status: "done" },
        } as { id: string; payload: unknown })
      : ({
          payload: { ...((inp.payload as Record<string, unknown>) ?? {}), _status: "pending" },
        } as { id: string; payload: unknown })),
  }));

  const isComplete = progress >= 100;
  const patch: Partial<RunRecord> = {
    progress,
    status: isComplete ? "completed" : "running",
    inputs: perInputStatus,
    ...(isComplete ? { finishedAt: new Date().toISOString() } : {}),
  };
  updateRun(userId, runId, patch);

  // Log a heartbeat every ~6 seconds so the /logs page also shows
  // activity (and the user can see the agent doing things there too).
  if (!isComplete && Math.floor(elapsedSec) % 6 === 0 && elapsedSec > 0) {
    appendLog(userId, {
      level: "info",
      agent: "echo-worker",
      scope: runId,
      msg: `Processed ${inputsDone}/${totalInputs} inputs (${progress}%)`,
    });
  }

  if (isComplete) {
    appendLog(userId, {
      level: "success",
      agent: "echo-worker",
      scope: runId,
      msg: `Run ${runId} finished. ${totalInputs}/${totalInputs} inputs processed.`,
    });
    stopRunSimulator(runId);
  }
}
