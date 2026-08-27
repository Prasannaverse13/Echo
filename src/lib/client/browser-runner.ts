/**
 * Browser runner — orchestrates the *real* headless-browser flow for
 * an Echo run. After the composer dispatches an agent and the server
 * hands back a list of `browserStops` (URLs the agent should visit),
 * this module walks the list, calls the Vercel-side
 * /api/browser/preview route for each, and writes a real
 * `BrowserAction` (with a base64 screenshot) into the local
 * `RunRecord.actions[]`.
 *
 * The client-side run simulator (run-simulator.ts) runs in parallel
 * and emits its own "think / click / type" actions so the user sees
 * a full action log even while the real browser is warming up or
 * when individual /api/browser/preview calls fail. The two streams
 * interleave in `actions[]` — the real-browser ones are tagged
 * `real: true` and carry `screenshot` data URLs so the BROWSER
 * CONSOLE renders them as inline thumbnails.
 *
 * Idempotency: the runner is keyed by `runId` on the window so a
 * second dispatch (or a re-mount of the composer) won't double up
 * the real-browser calls. The simulator's own `__echo_sim_handles`
 * is the corresponding key for the simulator.
 *
 * Failure mode: any individual /api/browser/preview call that
 * returns `ok: false` is logged to the action stream as a
 * "Browser call failed" think action. The run keeps going — the
 * simulator fills in the rest of the log.
 */

import {
  appendLog,
  getRun,
  updateRun,
  type BrowserAction,
} from "./stores";

interface Stop {
  url: string;
  site: string;
  label: string;
}

interface RunnerOpts {
  userId: string;
  runId: string;
  stops: Stop[];
}

const RUNNERS_KEY = "__echo_browser_runners";

declare global {
  // eslint-disable-next-line no-var
  var __echo_browser_runners: Record<string, boolean> | undefined;
}

/**
 * Kicks off a background async loop that calls /api/browser/preview
 * for each stop and writes the resulting real-browser action to
 * the run record. Idempotent on runId. Returns immediately; the
 * loop runs detached.
 */
export function startBrowserRunner(opts: RunnerOpts): void {
  if (typeof window === "undefined") return;
  if (!opts.stops?.length) return;
  if (!globalThis.__echo_browser_runners) globalThis.__echo_browser_runners = {};
  if (globalThis.__echo_browser_runners[opts.runId]) return; // already running
  globalThis.__echo_browser_runners[opts.runId] = true;

  // Fire-and-forget — the loop manages its own state.
  void runStops(opts).catch((err) => {
    console.error("browser-runner crashed", err);
  });
}

async function runStops(opts: RunnerOpts): Promise<void> {
  const { userId, runId, stops } = opts;
  appendLog(userId, {
    level: "action",
    agent: "echo-browser",
    scope: runId,
    msg: `Headless browser: preparing to visit ${stops.length} site(s)`,
  });

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const run = getRun(userId, runId);
    if (!run || run.status === "cancelled" || run.status === "failed") return;

    // Emit a "navigate" action immediately so the user sees the URL
    // bar update before the screenshot arrives.
    const navAction: BrowserAction = {
      ts: new Date().toISOString(),
      kind: "navigate",
      url: stop.url,
      label: `Navigate to ${stop.site} — ${stop.label}`,
    };
    appendAction(userId, runId, navAction, stop.url);

    appendLog(userId, {
      level: "action",
      agent: "echo-browser",
      scope: runId,
      msg: `→ Navigating to ${stop.url} in real headless Chromium`,
    });

    try {
      const res = await fetch("/api/browser/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: stop.url }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        url?: string;
        title?: string;
        screenshot?: string;
        elapsedMs?: number;
        error?: string;
      };

      if (data.ok) {
        const extractAction: BrowserAction = {
          ts: new Date().toISOString(),
          kind: "extract",
          url: stop.url,
          label: `Captured "${data.title ?? stop.site}"`,
          detail: `Real headless Chromium · ${data.elapsedMs ?? 0}ms · ${
            data.screenshot ? "screenshot saved" : "no screenshot"
          }`,
          screenshot: data.screenshot,
          elapsedMs: data.elapsedMs,
          real: true,
        };
        appendAction(userId, runId, extractAction);
        appendLog(userId, {
          level: "success",
          agent: "echo-browser",
          scope: runId,
          msg: `✓ Screenshot captured at ${stop.url} (${data.elapsedMs ?? "?"}ms) — "${
            data.title ?? "(no title)"
          }"`,
        });
      } else {
        const errAction: BrowserAction = {
          ts: new Date().toISOString(),
          kind: "think",
          url: stop.url,
          label: `Browser call failed for ${stop.site}`,
          detail: data.error ?? "Unknown error from /api/browser/preview",
        };
        appendAction(userId, runId, errAction);
        appendLog(userId, {
          level: "warn",
          agent: "echo-browser",
          scope: runId,
          msg: `Browser call failed for ${stop.url}: ${data.error ?? "unknown"}`,
        });
      }
    } catch (err) {
      const errAction: BrowserAction = {
        ts: new Date().toISOString(),
        kind: "think",
        url: stop.url,
        label: `Network error reaching browser service`,
        detail: err instanceof Error ? err.message : String(err),
      };
      appendAction(userId, runId, errAction);
      appendLog(userId, {
        level: "error",
        agent: "echo-browser",
        scope: runId,
        msg: `Network error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Brief pause between stops so the URL bar transitions are
    // visible to the user instead of the screenshots all arriving
    // in a single burst.
    if (i < stops.length - 1) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  appendLog(userId, {
    level: "success",
    agent: "echo-browser",
    scope: runId,
    msg: `Headless browser finished ${stops.length} navigation(s)`,
  });

  // Release the idempotency lock so a future dispatch on the same
  // runId (rare, but possible) can run again.
  if (globalThis.__echo_browser_runners) {
    delete globalThis.__echo_browser_runners[runId];
  }
}

function appendAction(
  userId: string,
  runId: string,
  action: BrowserAction,
  newCurrentUrl?: string
): void {
  const run = getRun(userId, runId);
  if (!run) return;
  const next = [...(run.actions ?? []), action];
  updateRun(userId, runId, {
    actions: next,
    ...(newCurrentUrl ? { currentUrl: newCurrentUrl } : {}),
  });
}
