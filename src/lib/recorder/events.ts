/**
 * Browser-side event capture for the recorder.
 *
 * The Microsoft Skill Recorder captures app/window/URL/clipboard events at
 * the OS level via Electron. We're a web app, so we only have access to
 * the BROWSER's own state — but that's a meaningful slice of what the user
 * does (most of the demo workflows are browser-first: LinkedIn, Gmail,
 * HubSpot, Sheets, etc.).
 *
 * What we capture:
 *   - `url.change` — fires on `popstate` / `hashchange` / beforeunload
 *     of the recorder page (since the recorder is on /record). Also a
 *     periodic poll of `window.location.href` so we catch SPA route changes.
 *   - `title.change` — `document.title` mutations.
 *   - `focus` / `blur` — `window.onfocus` / `onblur` / `visibilitychange`.
 *   - `scroll` — coarse scroll position changes (debounced).
 *   - `clipboard.copy` — when the user explicitly hits ⌘C / right-click
 *     copy, we capture a preview of the clipboard text (requires the
 *     Clipboard API permission the user grants at the start of recording).
 *   - `marker` — user-pressed markers (an in-app button that records a
 *     "I started something new here" beat).
 *
 * What we DO NOT capture:
 *   - Mouse coordinates / clicks (the recorder is in a side panel; user
 *     clicks are happening in OTHER apps / the shared screen, not in the
 *     recorder itself).
 *   - Keystrokes typed in other apps.
 *
 * All events are kept in-memory and serialized into a compact JSON for the
 * upload. The user is told in the UI that we capture "the pages you visit
 * and text you copy while recording" — and nothing leaves until they hit
 * "Stop & learn".
 */

import type { Analysis } from "./analysis-schema";

export type RecEventType =
  | "session.start"
  | "session.stop"
  | "url.change"
  | "title.change"
  | "focus"
  | "blur"
  | "scroll"
  | "clipboard.copy"
  | "marker";

export interface RecEvent {
  /** Monotonic per-session index. */
  seq: number;
  /** Milliseconds since session start. */
  t: number;
  /** Wall-clock epoch ms. */
  epoch: number;
  type: RecEventType;
  /** "recorder" for events the recorder itself produced; "browser" for OS-level
   *  ones we observed (URL / title / focus). */
  source: "recorder" | "browser";
  payload: Record<string, unknown>;
}

/**
 * A compact session bundle — the deterministic input contract for the
 * Describer agent. This is the browser-side analogue of MS's
 * `SessionBundle` (`common/bundle.ts`), minus the video correlation.
 */
export interface SessionBundle {
  version: 1;
  session: {
    id: string;
    startedAt: number;
    stoppedAt: number | null;
    durationMs: number;
    /** Where the recording happened (always "web" for Echo). */
    platform: "web";
  };
  /** Ordered events (after session.start, before session.stop). */
  events: RecEvent[];
  /** Stats summary. */
  stats: {
    eventCount: number;
    /** Subset of events that carry real semantic meaning (URL / clipboard / marker). */
    meaningfulEventCount: number;
  };
}

/** Event types that carry semantic meaning for the Describer. The "structural"
 *  ones (session.start, focus, blur, scroll) are not "meaningful" but still
 *  useful for timing. */
export const MEANINGFUL_EVENT_TYPES: ReadonlySet<RecEventType> = new Set([
  "url.change",
  "title.change",
  "clipboard.copy",
  "marker",
]);

/**
 * Strip a URL to its origin + pathname (drop query + hash) so two URLs that
 * differ only in tracking params collapse to the same.
 */
export function normalizeUrl(raw: string): { url: string; host?: string; path: string } {
  try {
    const u = new URL(raw, "http://localhost/");
    return {
      url: `${u.origin}${u.pathname}`,
      host: u.host || undefined,
      path: u.pathname,
    };
  } catch {
    return { url: raw, path: raw };
  }
}

/**
 * Build a compact, JSON-safe string of the events that "explain" the
 * session — the ones the Describer should consider alongside the video.
 * Drops the session.start / session.stop brackets and the noisy
 * focus/blur/scroll events; keeps URL changes, title changes, clipboard,
 * and markers.
 */
export function serializeTimelineForDescriber(bundle: SessionBundle): string {
  const rows = bundle.events
    .filter((e) => MEANINGFUL_EVENT_TYPES.has(e.type))
    .map((e) => {
      const sec = (e.t / 1000).toFixed(1);
      const p = e.payload as Record<string, unknown>;
      switch (e.type) {
        case "url.change":
          return `[${sec}s] url → ${p.url ?? p.path ?? "?"}${p.title ? ` (${String(p.title).slice(0, 80)})` : ""}`;
        case "title.change":
          return `[${sec}s] title → ${String(p.title ?? "").slice(0, 120)}`;
        case "clipboard.copy":
          return `[${sec}s] copy → ${String(p.preview ?? "").slice(0, 200)}`;
        case "marker":
          return `[${sec}s] marker → ${String(p.note ?? "").slice(0, 120)}`;
        default:
          return `[${sec}s] ${e.type}`;
      }
    });
  return rows.join("\n");
}

/**
 * Build a placeholder analysis (used when the user records without an
 * actual video and only has the event timeline). Mirrors the Describer's
 * output shape but with empty steps — the agent fills them in from the
 * events + the user's free-text description.
 */
export function analysisFromEventsOnly(bundle: SessionBundle, intentHint?: string): Partial<Analysis> {
  return {
    version: 1,
    sessionId: bundle.session.id,
    revision: 0,
    createdAt: new Date().toISOString(),
    title: intentHint?.slice(0, 60) || "Recorded workflow",
    intent: intentHint || "User-recorded workflow (no video attached)",
    intentConfidence: "low",
    intentRationale: "Reconstructed from event timeline only — no video was attached.",
    steps: [],
    feedbackLog: [],
    approved: false,
  };
}
