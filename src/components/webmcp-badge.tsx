"use client";

/**
 * WebMCP badge — a small status pill that shows in the AppShell topbar.
 *
 *   - Hidden when the browser doesn't expose `document.modelContext`.
 *   - Shows "WebMCP · N tools" once tools are registered.
 *   - Clicking the pill opens a tiny popover with the list of registered
 *     tool names + a link to the Chrome origin trial.
 *
 * The badge doesn't register any tools itself; it's a pure status
 * indicator. Pages register tools via `useWebMCPTools`, and the badge
 * reads the live `document.modelContext.getTools()` count on mount + on
 * focus (so the count updates as the user navigates between pages and
 * different page-specific tool sets register/unregister).
 */

import * as React from "react";

interface ToolSummary {
  name: string;
  title?: string;
  description?: string;
}

const ORIGIN_TRIAL_URL =
  "https://developer.chrome.com/docs/ai/webmcp";
const INSPECTOR_URL =
  "https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapenggkahomfgkhfehlcenpd";

export function WebMCPBadge() {
  const [supported, setSupported] = React.useState<boolean | null>(null);
  const [tools, setTools] = React.useState<ToolSummary[]>([]);
  const [open, setOpen] = React.useState(false);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);

  // Detect support + load tools. Refresh when the window regains focus
  // so the count updates as pages mount/unmount.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const supportedNow = "modelContext" in document;
    setSupported(supportedNow);
    if (!supportedNow) return;

    const refresh = () => {
      const ctx = document.modelContext;
      if (!ctx || typeof ctx.getTools !== "function") {
        setTools([]);
        return;
      }
      ctx
        .getTools()
        .then((list) => setTools(list as ToolSummary[]))
        .catch(() => setTools([]));
    };
    refresh();
    window.addEventListener("focus", refresh);
    // Also poll every 2s while the popover is open so the user sees live updates.
    const id = setInterval(refresh, 2000);
    return () => {
      window.removeEventListener("focus", refresh);
      clearInterval(id);
    };
  }, []);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!popoverRef.current) return;
      if (popoverRef.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  if (supported !== true) return null;

  const count = tools.length;

  return (
    <div className="relative" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-caption font-medium border border-slate-teal/30 bg-slate-teal/10 text-slate-teal hover:bg-slate-teal/15 transition-colors"
        title={`${count} WebMCP tool${count === 1 ? "" : "s"} registered`}
      >
        <span
          aria-hidden
          className="inline-block w-1.5 h-1.5 rounded-full bg-slate-teal"
        />
        WebMCP · {count} tool{count === 1 ? "" : "s"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Registered WebMCP tools"
          className="absolute right-0 mt-2 w-80 max-h-96 overflow-auto rounded-xl border border-iron bg-paper-white shadow-lg z-50"
        >
          <div className="px-4 py-3 border-b border-iron">
            <p className="text-caption font-bold uppercase tracking-wider text-obsidian/60">
              WebMCP tools
            </p>
            <p className="text-caption text-obsidian/50 mt-1">
              In-browser agents can call these. Open the Inspector extension to try.
            </p>
          </div>
          {tools.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-caption text-obsidian/50">
                No tools registered yet. Navigate to a dashboard page.
              </p>
            </div>
          ) : (
            <ul className="py-2">
              {tools.map((t) => (
                <li
                  key={t.name}
                  className="px-4 py-2 hover:bg-bone/40 border-b border-iron/40 last:border-b-0"
                >
                  <p className="text-caption font-mono font-bold text-obsidian break-all">
                    {t.name}
                  </p>
                  {t.title && t.title !== t.name && (
                    <p className="text-caption text-obsidian/50 mt-0.5">
                      {t.title}
                    </p>
                  )}
                  {t.description && (
                    <p className="text-caption text-obsidian/60 mt-1 leading-snug">
                      {t.description.length > 140
                        ? t.description.slice(0, 137) + "…"
                        : t.description}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="px-4 py-3 border-t border-iron bg-bone/30 flex flex-col gap-1.5">
            <a
              href={INSPECTOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-caption text-slate-teal underline-offset-2 hover:underline"
            >
              Model Context Tool Inspector →
            </a>
            <a
              href={ORIGIN_TRIAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-caption text-obsidian/50 underline-offset-2 hover:underline"
            >
              About WebMCP ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
