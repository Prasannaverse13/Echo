"use client";

/**
 * `useRecorderEvents` — browser-side event capture for the recorder.
 *
 * Wraps the Recorder page's recording lifecycle to collect a small
 * browser-level event timeline (URL changes, page title, focus, scroll,
 * optional clipboard) and expose it as a `SessionBundle` when the
 * recording stops. Combined with the screen video, this gives the
 * Describer more signal to work with.
 *
 * The Recorder page itself is a SPA on `/record`. Most of the user's
 * activity is happening in OTHER tabs / apps they shared — so the URL /
 * title events come from those (via the shared screen). This hook
 * captures what Echo *can* see in its own tab, plus an opt-in clipboard
 * subscription (which fires when the user copies text in the shared
 * tab, if the browser's Clipboard API allows it).
 *
 * The hook is a pure passthrough — no network calls, no async work.
 * The Recorder page decides when to start / stop and what to do with
 * the resulting bundle.
 */

import { useEffect, useRef } from "react";
import {
  MEANINGFUL_EVENT_TYPES,
  normalizeUrl,
  type RecEvent,
  type SessionBundle,
} from "./events";

export interface UseRecorderEventsOpts {
  /** True while the recorder is actively capturing. */
  active: boolean;
  /** Called when an event is appended (for live UI badge if desired). */
  onEvent?: (e: RecEvent) => void;
  /** True to enable clipboard polling (requires the user has granted
   *  clipboard-read permission in the browser). */
  enableClipboard?: boolean;
}

export interface UseRecorderEventsResult {
  /** Stop and return the captured bundle. */
  stop: () => SessionBundle;
  /** Current event count (live). */
  count: () => number;
}

export function useRecorderEvents(opts: UseRecorderEventsOpts): UseRecorderEventsResult {
  const startedAtRef = useRef<number>(0);
  const sessionIdRef = useRef<string>("");
  const eventsRef = useRef<RecEvent[]>([]);
  const seqRef = useRef<number>(0);
  const lastUrlRef = useRef<string>("");
  const lastTitleRef = useRef<string>("");
  const clipboardIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastClipboardHashRef = useRef<string>("");
  const onEventRef = useRef(opts.onEvent);
  onEventRef.current = opts.onEvent;

  const append = (type: RecEvent["type"], payload: Record<string, unknown>, source: RecEvent["source"] = "browser") => {
    if (!startedAtRef.current) return;
    const epoch = Date.now();
    const t = epoch - startedAtRef.current;
    const ev: RecEvent = { seq: seqRef.current++, t, epoch, type, source, payload };
    eventsRef.current.push(ev);
    onEventRef.current?.(ev);
  };

  useEffect(() => {
    if (!opts.active) return;
    startedAtRef.current = Date.now();
    sessionIdRef.current = `sess_${startedAtRef.current}_${Math.random().toString(36).slice(2, 8)}`;
    eventsRef.current = [];
    seqRef.current = 0;
    lastUrlRef.current = window.location.href;
    lastTitleRef.current = document.title;
    append("session.start", { platform: "web" }, "recorder");

    // Page title observer (cheap MutationObserver).
    const titleObserver = new MutationObserver(() => {
      const t = document.title;
      if (t && t !== lastTitleRef.current) {
        lastTitleRef.current = t;
        append("title.change", { title: t.slice(0, 200) });
      }
    });
    titleObserver.observe(document.querySelector("title") ?? document.head, {
      childList: true,
      characterData: true,
      subtree: true,
    });

    // URL poll (1s) — covers SPA history changes that don't fire popstate.
    const urlInterval = setInterval(() => {
      const url = window.location.href;
      if (url && url !== lastUrlRef.current) {
        lastUrlRef.current = url;
        const norm = normalizeUrl(url);
        append("url.change", { url: norm.url, path: norm.path, host: norm.host });
      }
    }, 1000);

    // Focus / visibility.
    const onFocus = () => append("focus", {});
    const onBlur = () => append("blur", {});
    const onVisibility = () => append(document.hidden ? "blur" : "focus", { visibilityState: document.visibilityState });
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);

    // Coarse scroll position (debounced).
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (scrollTimer) return;
      scrollTimer = setTimeout(() => {
        scrollTimer = null;
        append("scroll", { x: window.scrollX, y: window.scrollY });
      }, 500);
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    // Optional clipboard polling. We only do this if the user has
    // explicitly enabled it (opt-in via UI). Browser Clipboard API
    // requires user-gesture permission; we silently no-op otherwise.
    if (opts.enableClipboard) {
      const pollClipboard = async () => {
        try {
          // Some browsers throw if permission wasn't granted; swallow.
          const text = await navigator.clipboard.readText();
          if (!text) return;
          // Cheap hash to dedupe.
          const hash = await sha256(text);
          if (hash === lastClipboardHashRef.current) return;
          lastClipboardHashRef.current = hash;
          append("clipboard.copy", { preview: text.slice(0, 400), length: text.length, hash });
        } catch {
          // ignore
        }
      };
      clipboardIntervalRef.current = setInterval(pollClipboard, 2000);
    }

    return () => {
      titleObserver.disconnect();
      clearInterval(urlInterval);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("scroll", onScroll);
      if (scrollTimer) clearTimeout(scrollTimer);
      if (clipboardIntervalRef.current) clearInterval(clipboardIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.active, opts.enableClipboard]);

  return {
    count: () => eventsRef.current.length,
    stop: () => {
      const stoppedAt = Date.now();
      const startedAt = startedAtRef.current || stoppedAt;
      append("session.stop", {});
      const events = eventsRef.current.slice();
      startedAtRef.current = 0;
      return {
        version: 1,
        session: {
          id: sessionIdRef.current,
          startedAt,
          stoppedAt,
          durationMs: Math.max(0, stoppedAt - startedAt),
          platform: "web",
        },
        events,
        stats: {
          eventCount: events.length,
          meaningfulEventCount: events.filter((e) => MEANINGFUL_EVENT_TYPES.has(e.type)).length,
        },
      };
    },
  };
}

async function sha256(s: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    try {
      const enc = new TextEncoder().encode(s);
      const buf = await crypto.subtle.digest("SHA-256", enc);
      return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 32);
    } catch {
      // fall through
    }
  }
  // Tiny non-crypto fallback.
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return String(h);
}
