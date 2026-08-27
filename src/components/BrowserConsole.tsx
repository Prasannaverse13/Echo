"use client";

/**
 * BrowserConsole — a fake headless-browser pane that visualises the
 * stream of BrowserAction records the run simulator (or a real worker,
 * later) is producing for a given run.
 *
 * The pane shows three things:
 *   1. A browser-chrome URL bar that mirrors the run's `currentUrl`
 *   2. The most recent action's label (a one-line status) so the
 *      user can read what the agent is "doing" right now
 *   3. A scrolling log of the last few actions, with kind-specific
 *      icons so the user can tell navigate / click / type / extract
 *      / save apart at a glance
 *
 * The look is deliberately chrome-y (rounded URL bar, three dots,
 * monospace URL) so the user reads it as a "browser". No real
 * navigation happens — this is a UI affordance that wraps the
 * stream of action records the simulator pushes to localStorage.
 *
 * This component is a pure renderer; it does not fetch, mutate, or
 * start the simulator. Parent components (composer dispatched card,
 * /runs/[id] page) pass the actions array and currentUrl as props.
 */

import * as React from "react";
import type { BrowserAction } from "@/lib/client/stores";

const kindIcon: Record<BrowserAction["kind"], string> = {
  navigate: "↗",
  click: "●",
  type: "✎",
  extract: "↓",
  save: "✓",
  think: "✦",
};

const kindColor: Record<BrowserAction["kind"], string> = {
  navigate: "text-obsidian",
  click: "text-wisteria",
  type: "text-obsidian",
  extract: "text-dusty-sky",
  save: "text-mist-mint",
  think: "text-obsidian/60",
};

interface BrowserConsoleProps {
  actions: BrowserAction[] | undefined;
  currentUrl: string | undefined;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "review";
  /** How many recent actions to show in the scrolling log. */
  tail?: number;
  /** Compact mode for the small composer dispatched card. */
  compact?: boolean;
}

export function BrowserConsole({
  actions,
  currentUrl,
  status,
  tail = 8,
  compact = false,
}: BrowserConsoleProps) {
  const all = actions ?? [];
  const last = all[all.length - 1];
  const recent = all.slice(-tail);
  const isRunning = status === "running" || status === "queued";
  const displayUrl = currentUrl ?? last?.url ?? "about:blank";

  return (
    <div
      className={`rounded-2xl overflow-hidden bg-bone hairline ${
        compact ? "" : "shadow-sm"
      }`}
    >
      {/* Browser chrome — URL bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-iron/60 border-b border-iron">
        <div className="flex items-center gap-1 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-desert-clay/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-bone/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-mist-mint/70" />
        </div>
        <div className="flex-1 min-w-0">
          <div
            className={`flex items-center gap-2 rounded-md bg-paper-white border border-iron/40 px-3 ${
              compact ? "h-6 text-caption" : "h-8 text-caption"
            }`}
          >
            <svg
              className="w-3 h-3 text-obsidian/40 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span className="font-mono text-obsidian/70 truncate" title={displayUrl}>
              {displayUrl}
            </span>
            {isRunning && (
              <span className="ml-auto shrink-0 flex items-center gap-1 text-obsidian/50">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-obsidian animate-pulse" />
                <span className="text-[10px]">live</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Current action (one line) + scrolling log */}
      <div className={`px-3 ${compact ? "py-2" : "py-3"} space-y-2`}>
        {last ? (
          <div
            className={`flex items-start gap-2 ${
              compact ? "text-caption" : "text-body-sm"
            }`}
          >
            <span
              className={`shrink-0 w-5 h-5 rounded-full bg-paper-white hairline flex items-center justify-center text-[11px] font-bold ${kindColor[last.kind]}`}
              aria-hidden
            >
              {kindIcon[last.kind]}
            </span>
            <div className="min-w-0">
              <p className="font-medium text-obsidian truncate">{last.label}</p>
              {last.detail && (
                <p className="text-caption text-obsidian/60 truncate">{last.detail}</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-caption text-obsidian/50 italic">
            Waiting for the agent to start…
          </p>
        )}

        {recent.length > 1 && (
          <ul className="border-t border-iron/40 pt-2 space-y-1">
            {recent
              .slice(0, -1)
              .reverse()
              .map((a, i) => (
                <li
                  key={`${a.ts}-${i}`}
                  className="flex items-start gap-2 text-caption text-obsidian/55"
                >
                  <span className={`shrink-0 w-3.5 ${kindColor[a.kind]}`} aria-hidden>
                    {kindIcon[a.kind]}
                  </span>
                  <span className="truncate">
                    {a.url && a.kind === "navigate" ? (
                      <>
                        <span className="font-mono opacity-70">{shortHost(a.url)}</span>
                        {" · "}
                        {a.label}
                      </>
                    ) : (
                      a.label
                    )}
                  </span>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function shortHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
