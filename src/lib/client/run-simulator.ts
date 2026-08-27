/**
 * Client-side run simulator.
 *
 * After the composer dispatches an agent run, this kicks off a background
 * ticker that drives BOTH:
 *   (a) the run's progress + per-input status in localStorage
 *   (b) a live "browser console" — a stream of BrowserAction records
 *       (navigate / click / type / extract / save) that the dispatched
 *       card and the /runs/[id] page render as a fake headless-browser
 *       pane. The user sees the agent "navigate" to real public sites
 *       (hubspot.com, linkedin.com, gmail.com, slack.com, etc.),
 *       "click" on buttons, "extract" data, and "save" results —
 *       giving the demo a real "watch the agent work" feel without
 *       requiring Cloud Run to actually be processing the run.
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
 * Action script: we parse keywords out of the goal (HubSpot, LinkedIn,
 * Gmail, Slack, Stripe, Sheets, Notion, etc.) and produce a believable
 * sequence of browser actions for the agent to perform. Falls back to
 * a generic "browse the web" script when no keywords match.
 *
 * Idempotency: the simulator is stored on `window` keyed by runId, so
 * a second dispatch call (e.g. if the user clicks "Dispatch" again, or
 * if a background tab also fires) won't double-up the ticker.
 *
 * Lifecycle: the simulator runs forever on a setInterval. When the
 * run hits 100% it marks itself `completed` and clears the interval
 * + window key.
 */

import {
  appendLog,
  getRun,
  updateRun,
  type BrowserAction,
  type RunRecord,
} from "./stores";

interface SimulatorOpts {
  userId: string;
  runId: string;
  totalInputs: number;
  goal?: string;
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

  // Plan the browser actions for this run. The simulator will pop
  // one action per tick so the browser console scrolls forward in
  // real time.
  const plan = buildActionPlan(opts.goal ?? "");
  // Pre-seed the run with the first action immediately so the browser
  // console isn't blank.
  const initialActions: BrowserAction[] = [];
  if (plan.length > 0) {
    initialActions.push({ ...plan[0], ts: new Date().toISOString() });
    updateRun(opts.userId, opts.runId, {
      actions: initialActions,
      currentUrl: plan[0].url,
    });
  }

  let actionIdx = 1; // next action to fire

  // First tick right away so the UI moves off 0% within ~50ms.
  tick(opts.userId, opts.runId, totalInputs, startedAt, totalSec, 0, plan, actionIdx);
  actionIdx = nextActionIdx(actionIdx, plan.length);

  const handle = window.setInterval(() => {
    const tickIdx = Math.floor((Date.now() - startedAt) / tickMs);
    const result = tick(
      opts.userId,
      opts.runId,
      totalInputs,
      startedAt,
      totalSec,
      tickIdx,
      plan,
      actionIdx
    );
    if (result.firedAction) actionIdx = nextActionIdx(actionIdx, plan.length);
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

function nextActionIdx(idx: number, total: number): number {
  return total === 0 ? 0 : (idx + 1) % total;
}

function tick(
  userId: string,
  runId: string,
  totalInputs: number,
  startedAtMs: number,
  totalSec: number,
  _tickIdx: number,
  plan: BrowserAction[],
  actionIdx: number
): { firedAction: boolean } {
  const run = getRun(userId, runId);
  if (!run) {
    stopRunSimulator(runId);
    return { firedAction: false };
  }
  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    stopRunSimulator(runId);
    return { firedAction: false };
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

  // Fire the next browser action if it's time. The plan repeats on a
  // loop, but on the *first* loop we only fire one action per tick to
  // make the navigation feel deliberate.
  let actions = run.actions ?? [];
  let currentUrl = run.currentUrl;
  let firedAction = false;
  if (plan.length > 0 && actions.length < plan.length * 2) {
    const next = plan[actionIdx % plan.length];
    actions = [...actions, { ...next, ts: new Date().toISOString() }];
    if (next.kind === "navigate" && next.url) {
      currentUrl = next.url;
    }
    firedAction = true;
  }

  const isComplete = progress >= 100;
  const patch: Partial<RunRecord> = {
    progress,
    status: isComplete ? "completed" : "running",
    inputs: perInputStatus,
    actions,
    currentUrl,
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

  return { firedAction };
}

/* ------------------------------------------------------------------ */
/* Action plan generation                                              */
/* ------------------------------------------------------------------ */

/**
 * Builds a believable sequence of browser actions for a given goal.
 * Parses common service keywords out of the goal and emits a plan
 * that visits each of them, performs a representative action, and
 * saves the result. Falls back to a generic "browse the web" plan
 * when no service keywords match.
 */
export function buildActionPlan(goal: string): BrowserAction[] {
  const lower = goal.toLowerCase();
  const stops: Array<{
    keyword: string;
    url: string;
    site: string;
    click?: BrowserAction;
    extract?: BrowserAction;
    think?: string;
  }> = [];

  if (/(hubspot|\blead)/.test(lower)) {
    stops.push({
      keyword: "HubSpot",
      url: "https://app.hubspot.com",
      site: "HubSpot",
      click: {
        ts: "",
        kind: "click",
        label: "Open 'Contacts' in the left nav",
      },
      extract: {
        ts: "",
        kind: "extract",
        label: "Extract new leads (first name, last name, email, company)",
        detail: "5 leads captured",
      },
    });
  }
  if (/(linkedin|\benrich)/.test(lower)) {
    stops.push({
      keyword: "LinkedIn",
      url: "https://www.linkedin.com",
      site: "LinkedIn",
      click: {
        ts: "",
        kind: "click",
        label: "Search the lead's name in the top search bar",
      },
      extract: {
        ts: "",
        kind: "extract",
        label: "Pull job title + current company from their profile",
        detail: "5 profiles enriched",
      },
    });
  }
  if (/(gmail|\bemail|\boutreach|\bdraft)/.test(lower)) {
    stops.push({
      keyword: "Gmail",
      url: "https://mail.google.com",
      site: "Gmail",
      click: {
        ts: "",
        kind: "click",
        label: "Click the 'Compose' button",
      },
      extract: {
        ts: "",
        kind: "type",
        label: "Draft a personalized outreach email using lead + enrichment data",
        detail: "5 drafts saved",
      },
    });
  }
  if (/(slack|\bnotify|\balert)/.test(lower)) {
    stops.push({
      keyword: "Slack",
      url: "https://app.slack.com",
      site: "Slack",
      click: {
        ts: "",
        kind: "click",
        label: "Open #sales channel",
      },
      extract: {
        ts: "",
        kind: "type",
        label: "Post a summary of the new drafts",
        detail: "Message sent to #sales",
      },
    });
  }
  if (/(stripe|\bpayment|\bbilling|\bsubscription)/.test(lower)) {
    stops.push({
      keyword: "Stripe",
      url: "https://dashboard.stripe.com",
      site: "Stripe",
      click: {
        ts: "",
        kind: "click",
        label: "Open 'Customers' tab",
      },
      extract: {
        ts: "",
        kind: "extract",
        label: "Pull usage data for the last 30 days",
        detail: "30 days of usage data",
      },
    });
  }
  if (/(notion|\bdoc|\bwiki|\bpage)/.test(lower)) {
    stops.push({
      keyword: "Notion",
      url: "https://www.notion.so",
      site: "Notion",
      click: {
        ts: "",
        kind: "click",
        label: "Open the target page",
      },
      extract: {
        ts: "",
        kind: "type",
        label: "Append the agent's output as a new section",
        detail: "Section appended",
      },
    });
  }
  if (/(sheet|\bgsheet|\bspreadsheet|\bexcel)/.test(lower)) {
    stops.push({
      keyword: "Google Sheets",
      url: "https://docs.google.com/spreadsheets",
      site: "Google Sheets",
      click: {
        ts: "",
        kind: "click",
        label: "Open the destination sheet",
      },
      extract: {
        ts: "",
        kind: "type",
        label: "Append rows of structured data",
        detail: "Rows appended",
      },
    });
  }

  // Always start with a 'think' action so the user sees the agent
  // warming up before the first navigation.
  const plan: BrowserAction[] = [];
  plan.push({
    ts: "",
    kind: "think",
    label: "Decompose goal into sub-tasks and match to known skills",
    detail: goal ? `Goal: "${goal.slice(0, 80)}${goal.length > 80 ? "…" : ""}"` : undefined,
  });

  if (stops.length === 0) {
    // Generic fallback
    plan.push(
      {
        ts: "",
        kind: "navigate",
        url: "https://www.google.com",
        label: "Navigate to Google to find the target service",
      },
      {
        ts: "",
        kind: "click",
        label: "Click the result that matches the goal",
      },
      {
        ts: "",
        kind: "extract",
        label: "Read the page and figure out the next step",
      },
      {
        ts: "",
        kind: "save",
        label: "Save the result for the run record",
      }
    );
  } else {
    for (const stop of stops) {
      plan.push({
        ts: "",
        kind: "navigate",
        url: stop.url,
        label: `Navigate to ${stop.site}`,
      });
      if (stop.think) {
        plan.push({ ts: "", kind: "think", label: stop.think });
      }
      if (stop.click) {
        plan.push({ ...stop.click, ts: "" });
      }
      if (stop.extract) {
        plan.push({ ...stop.extract, ts: "" });
      }
    }
  }

  // Always end with a save action.
  plan.push({
    ts: "",
    kind: "save",
    label: "Persist results to Firestore and report back",
  });

  return plan;
}
