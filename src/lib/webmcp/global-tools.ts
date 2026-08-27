"use client";

/**
 * Global WebMCP tools — available on every page of the Echo dashboard.
 *
 * These are the "ambient" tools an in-browser agent can call regardless
 * of which page it's currently looking at. Pages add their own
 * page-specific tools on top of these (composer, runs, agents).
 *
 * Mounted in `AppShell` so they live for the whole authenticated session.
 */

import type { WebMCPToolDefinition } from "./types";
import {
  listRuns,
  listAgents,
  getUserId,
} from "@/lib/client/stores";

export interface BuildGlobalToolsOpts {
  /** Next.js router, so navigate_echo does an SPA push (no full reload). */
  push: (href: string) => void;
  /** Current pathname, read from usePathname. */
  pathname: string;
}

export const DASHBOARD_ROUTES = [
  "/dashboard",
  "/compose",
  "/agents",
  "/skills",
  "/record",
  "/triggers",
  "/runs",
  "/logs",
  "/integrations",
  "/settings",
] as const;

export type DashboardRoute = (typeof DASHBOARD_ROUTES)[number];

/**
 * Surface a toast in the UI. The ToastHost component subscribes to this
 * window event and renders a transient pill at the top of the viewport.
 * Pages do not need to do anything; the show_toast tool just fires the
 * event and returns.
 */
export const TOAST_EVENT = "echo:webmcp:toast";
export type ToastLevel = "info" | "success" | "warning" | "error";
export interface ToastDetail {
  message: string;
  level: ToastLevel;
  /** ms before auto-dismiss; default 4000. */
  ttlMs?: number;
}
export function fireToast(detail: ToastDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail }));
}

export function buildGlobalTools(opts: BuildGlobalToolsOpts): WebMCPToolDefinition[] {
  return [
    {
      name: "navigate_echo",
      title: "Navigate Echo",
      description:
        "Navigate the Echo dashboard to a known route. Use this to move the user to the right page after a tool call (e.g. after dispatching a run, send them to /runs).",
      inputSchema: {
        type: "object",
        properties: {
          target: {
            type: "string",
            enum: [...DASHBOARD_ROUTES],
            description: "Destination path.",
          },
        },
        required: ["target"],
      },
      annotations: { readOnlyHint: false },
      execute: ({ target }) => {
        const href = String(target);
        opts.push(href);
        return { ok: true, navigatedTo: href, from: opts.pathname };
      },
    },
    {
      name: "get_echo_status",
      title: "Echo status",
      description:
        "Returns Echo's current status: signed-in user, current page, count of saved runs, count of saved agents, and whether GCP is connected (from the latest run's gcp flag, if any).",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => {
        const userId = getUserId();
        const runs = listRuns(userId);
        const agents = listAgents(userId);
        // Heuristic: if any run says connected, treat GCP as live.
        const gcp = runs.find((r) => r.gcp === "connected")
          ? "connected"
          : runs.find((r) => r.gcp === "disabled")
            ? "disabled"
            : "unknown";
        return {
          userId,
          pathname: opts.pathname,
          gcp,
          runCount: runs.length,
          agentCount: agents.length,
          lastRunAt: runs[0]?.startedAt ?? null,
          ts: new Date().toISOString(),
        };
      },
    },
    {
      name: "show_toast",
      title: "Show toast",
      description:
        "Display a transient toast notification in the Echo UI. Useful to confirm an action the agent took so the user sees feedback. The toast auto-dismisses.",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Text to show." },
          level: {
            type: "string",
            enum: ["info", "success", "warning", "error"],
            description: "Severity / color. Defaults to info.",
          },
          ttlMs: {
            type: "number",
            description: "How long to show the toast in milliseconds. Default 4000.",
          },
        },
        required: ["message"],
      },
      annotations: { readOnlyHint: false },
      execute: ({ message, level, ttlMs }) => {
        fireToast({
          message: String(message),
          level: ((level as ToastLevel) ?? "info"),
          ttlMs: typeof ttlMs === "number" ? Number(ttlMs) : undefined,
        });
        return { ok: true };
      },
    },
    {
      name: "wait",
      title: "Wait",
      description:
        "Pause the agent's execution for N milliseconds. Useful between tool calls so the user can see intermediate state (e.g. after dispatching, wait a beat, then navigate to /runs). Capped at 30s.",
      inputSchema: {
        type: "object",
        properties: {
          ms: {
            type: "number",
            minimum: 0,
            maximum: 30000,
            description: "Milliseconds to sleep.",
          },
        },
        required: ["ms"],
      },
      annotations: { readOnlyHint: true },
      execute: async ({ ms }) => {
        const t = Math.max(0, Math.min(30000, Number(ms) || 0));
        await new Promise<void>((r) => setTimeout(r, t));
        return { ok: true, sleptMs: t };
      },
    },
    {
      name: "echo_ping",
      title: "Echo ping",
      description:
        "Lightweight liveness check. Returns Echo + the current time. Use to confirm the WebMCP bridge is live before doing anything heavy.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => ({ ok: true, pong: true, ts: new Date().toISOString() }),
    },
  ];
}
