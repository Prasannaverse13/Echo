"use client";

/**
 * ToastHost — listens for `echo:webmcp:toast` window events (fired by
 * the `show_toast` WebMCP tool) and renders a transient pill at the
 * top-right of the viewport.
 *
 * Stacks up to 4 toasts; auto-dismisses after the tool's ttlMs (default
 * 4000ms). No deps on any toast library — the WebMCP bridge is the
 * only producer, so the surface stays tiny.
 */

import * as React from "react";
import { TOAST_EVENT, type ToastDetail, type ToastLevel } from "@/lib/webmcp/global-tools";

const MAX_VISIBLE = 4;
const DEFAULT_TTL = 4000;

interface VisibleToast extends ToastDetail {
  id: string;
  createdAt: number;
}

const styleByLevel: Record<ToastLevel, string> = {
  info: "bg-paper-white text-obsidian border-iron",
  success: "bg-mist-mint text-obsidian border-mist-mint",
  warning: "bg-desert-clay text-obsidian border-desert-clay",
  error: "bg-obsidian text-paper-white border-obsidian",
};

const iconByLevel: Record<ToastLevel, string> = {
  info: "ℹ",
  success: "✓",
  warning: "!",
  error: "✕",
};

export function ToastHost() {
  const [toasts, setToasts] = React.useState<VisibleToast[]>([]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const onToast = (e: Event) => {
      const detail = (e as CustomEvent<ToastDetail>).detail;
      if (!detail || typeof detail.message !== "string") return;
      const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const next: VisibleToast = {
        id,
        message: detail.message,
        level: detail.level ?? "info",
        ttlMs: detail.ttlMs,
        createdAt: Date.now(),
      };
      setToasts((prev) => [next, ...prev].slice(0, MAX_VISIBLE));
      const ttl = Math.max(500, detail.ttlMs ?? DEFAULT_TTL);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, ttl);
    };
    window.addEventListener(TOAST_EVENT, onToast as EventListener);
    return () => window.removeEventListener(TOAST_EVENT, onToast as EventListener);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-start gap-2 max-w-sm px-3 py-2 rounded-lg border shadow-sm text-caption font-medium animate-in fade-in slide-in-from-top-2 ${styleByLevel[t.level]}`}
        >
          <span aria-hidden className="text-base leading-none mt-px">
            {iconByLevel[t.level]}
          </span>
          <p className="leading-snug">{t.message}</p>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setToasts((prev) => prev.filter((p) => p.id !== t.id))}
            className="ml-1 opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
