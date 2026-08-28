/**
 * Browser runner — orchestrates the *real* headless-browser flow for
 * an Echo run. After the composer dispatches an agent and the server
 * hands back a list of `browserStops` (URLs + action scripts), this
 * module walks the list, calls the Vercel-side
 * /api/browser/preview route for each stop with its action script,
 * and writes the resulting real `BrowserAction` records (with
 * base64 screenshots) into the local `RunRecord.actions[]`.
 *
 * Each action script is a small list of real browser actions
 * (click / fill / type / press / wait / hover / scroll / extract)
 * that the headless Chromium performs against the target site.
 * This is what makes the composer's BROWSER CONSOLE show real
 * "click the Compose button" / "fill the To field" steps instead of
 * a single navigate-and-screenshot. Steps that target auth-walled
 * elements fail at runtime (no session) — the action log captures
 * the failure and the simulator still fills in the rest.
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
import { playCaptureChime, playErrorChirp } from "./client-helpers";

type ActionKind =
  | "click"
  | "fill"
  | "type"
  | "press"
  | "wait"
  | "hover"
  | "scroll"
  | "extract"
  | "screenshot"
  | "select";

interface ScriptAction {
  type: ActionKind;
  selector?: string;
  value?: string;
  text?: string;
  key?: string;
  ms?: number;
  direction?: "up" | "down" | "top" | "bottom";
  amount?: number;
  label?: string;
  timeout?: number;
}

interface Stop {
  url: string;
  site: string;
  label: string;
  actions: ScriptAction[];
}

interface RunnerOpts {
  userId: string;
  runId: string;
  stops: Stop[];
}

declare global {
  // eslint-disable-next-line no-var
  var __echo_browser_runners: Record<string, boolean> | undefined;
}

/**
 * Kicks off a background async loop that calls /api/browser/preview
 * for each stop with its planned action script and writes the
 * resulting real-browser actions to the run record. Idempotent on
 * runId. Returns immediately; the loop runs detached.
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
    msg: `Headless browser: planning ${stops.length} site visit(s) with action scripts`,
  });

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const run = getRun(userId, runId);
    if (!run || run.status === "cancelled" || run.status === "failed") return;

    // Emit a "navigate" action immediately so the user sees the URL
    // bar update before the script's results arrive.
    const navAction: BrowserAction = {
      ts: new Date().toISOString(),
      kind: "navigate",
      url: stop.url,
      label: `Navigate to ${stop.site} — ${stop.label}`,
    };
    appendAction(userId, runId, navAction, stop.url);

    // Emit a "think" action announcing the action script so the
    // user can see what the agent plans to do on this page.
    const planLabel = (stop.actions ?? [])
      .map((a) => `${a.type}:${a.label ?? a.selector ?? ""}`)
      .join(" → ");
    appendAction(userId, runId, {
      ts: new Date().toISOString(),
      kind: "think",
      url: stop.url,
      label: `Plan for ${stop.site}: ${planLabel || "(no actions)"}`,
    });

    appendLog(userId, {
      level: "action",
      agent: "echo-browser",
      scope: runId,
      msg: `→ ${stop.site}: navigating to ${stop.url} and running ${(stop.actions ?? []).length} browser action(s)`,
    });

    try {
      const res = await fetch("/api/browser/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: stop.url, actions: stop.actions ?? [] }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        url?: string;
        finalUrl?: string;
        title?: string;
        actionResults?: Array<{
          type: ActionKind;
          ok: boolean;
          label?: string;
          extracted?: string;
          error?: string;
          elapsedMs: number;
        }>;
        initialScreenshot?: string;
        screenshot?: string;
        elapsedMs?: number;
        error?: string;
      };

      if (!data.ok) {
        // Whole script failed
        playErrorChirp();
        const errAction: BrowserAction = {
          ts: new Date().toISOString(),
          kind: "think",
          url: stop.url,
          label: `Browser script failed for ${stop.site}`,
          detail: data.error ?? "Unknown error from /api/browser/preview",
        };
        appendAction(userId, runId, errAction);
        appendLog(userId, {
          level: "warn",
          agent: "echo-browser",
          scope: runId,
          msg: `Browser script failed for ${stop.url}: ${data.error ?? "unknown"}`,
        });
        continue;
      }

      // Emit an extract action for the initial page load (the
      // "before" snapshot) so the user sees what the browser saw
      // before any clicks. This is the headline moment — play the
      // capture chime so the demo has an audio cue when the
      // headless browser actually delivers a real screenshot.
      if (data.initialScreenshot) {
        playCaptureChime();
        appendAction(userId, runId, {
          ts: new Date().toISOString(),
          kind: "extract",
          url: data.finalUrl ?? stop.url,
          label: `Loaded ${stop.site} — title: "${data.title ?? "(unknown)"}"`,
          detail: `Real headless Chromium · ${data.elapsedMs ?? 0}ms · initial snapshot saved`,
          screenshot: data.initialScreenshot,
          elapsedMs: data.elapsedMs,
          real: true,
        });
        appendLog(userId, {
          level: "success",
          agent: "echo-browser",
          scope: runId,
          msg: `✓ Loaded ${stop.url} — title "${data.title ?? "(no title)"}" (${data.elapsedMs ?? "?"}ms)`,
        });
      }

      // Emit one action per script step with its individual result.
      // Failed actions still appear in the log so the user can see
      // what the agent tried and why it failed.
      for (let ai = 0; ai < (data.actionResults ?? []).length; ai++) {
        const r = data.actionResults![ai];
        const kind: BrowserAction["kind"] =
          r.type === "click"
            ? "click"
            : r.type === "fill" || r.type === "type" || r.type === "press" || r.type === "select"
              ? "type"
              : r.type === "extract" || r.type === "screenshot"
                ? "extract"
                : r.type === "hover" || r.type === "scroll" || r.type === "wait"
                  ? "think"
                  : "think";
        const ba: BrowserAction = {
          ts: new Date().toISOString(),
          kind,
          url: data.finalUrl ?? stop.url,
          label: r.ok
            ? r.label ?? `${r.type}`
            : `${r.label ?? r.type} (failed)`,
          detail: r.ok
            ? r.extracted
              ? `→ ${r.extracted.slice(0, 80)}`
              : `Real headless Chromium · ${r.elapsedMs}ms`
            : r.error ?? "Unknown error",
          elapsedMs: r.elapsedMs,
          real: true,
        };
        appendAction(userId, runId, ba);
        if (!r.ok) {
          appendLog(userId, {
            level: "warn",
            agent: "echo-browser",
            scope: runId,
            msg: `Step ${ai + 1} (${r.type}) failed on ${stop.site}: ${r.error ?? "unknown"}`,
          });
        }
      }

      // Final screenshot — the "after" snapshot showing the
      // result of all the script actions.
      if (data.screenshot) {
        appendAction(userId, runId, {
          ts: new Date().toISOString(),
          kind: "extract",
          url: data.finalUrl ?? stop.url,
          label: `Final state of ${stop.site}`,
          detail: `Real headless Chromium · ${
            data.actionResults?.length ?? 0
          } action(s) executed · final snapshot`,
          screenshot: data.screenshot,
          elapsedMs: data.elapsedMs,
          real: true,
        });
        appendLog(userId, {
          level: "success",
          agent: "echo-browser",
          scope: runId,
          msg: `✓ Script finished on ${stop.site} (${
            data.actionResults?.filter((r) => r.ok).length ?? 0
          }/${data.actionResults?.length ?? 0} steps ok)`,
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
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  appendLog(userId, {
    level: "success",
    agent: "echo-browser",
    scope: runId,
    msg: `Headless browser finished ${stops.length} stop(s) with real action scripts`,
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
