"use client";

/**
 * useWebMCPTools — register a list of tools with Chrome's WebMCP API
 * (`document.modelContext`).
 *
 * Behavior:
 *   - Feature-detects `document.modelContext`. If absent (Chrome <146 or
 *     any non-supporting browser), the hook no-ops and `supported` is
 *     `false`. The calling page keeps working exactly as before.
 *   - Uses one AbortController per mount; aborting unregisters every tool
 *     atomically. No leaks across remounts.
 *   - Logs a console warning per failed registration (usually name
 *     collision across hook instances) but never throws.
 *   - Stable across re-renders: the registration only re-runs when the
 *     set of tool NAMES changes. Tool body changes are picked up via
 *     the ref-map; we don't tear down + re-register for a memoized
 *     list.
 *
 * Demo path:
 *   1. Open composer in Chrome 146+ (or with the testing flag).
 *   2. Install the Model Context Tool Inspector extension.
 *   3. See the registered tools in the inspector.
 *   4. Invoke one — the call lands in the page's existing fetch flow.
 */

import * as React from "react";
import type { WebMCPContent, WebMCPModelContext, WebMCPToolDefinition } from "./types";

type ToolBody = WebMCPToolDefinition["execute"];

export interface UseWebMCPToolsResult {
  /** `true` when the browser exposed `document.modelContext`. */
  supported: boolean;
  /** Number of tools successfully registered in the current mount. */
  count: number;
  /** True while the initial registration pass is still running. */
  pending: boolean;
  /** Last registration error, if any. */
  error?: string;
}

const EMPTY: UseWebMCPToolsResult = { supported: false, count: 0, pending: false };

/**
 * Wrap a tool body's return value in WebMCP's content envelope.
 * Strings become a single text part. Objects/arrays are JSON-stringified.
 * Errors thrown by the body are converted to `isError: true` content.
 */
async function wrapExecute(
  body: ToolBody,
  input: Record<string, unknown>
): Promise<WebMCPContent> {
  try {
    const raw = await body(input);
    const text =
      typeof raw === "string"
        ? raw
        : JSON.stringify(raw, null, 2);
    return { content: [{ type: "text", text }] };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
  }
}

export function useWebMCPTools(tools: WebMCPToolDefinition[]): UseWebMCPToolsResult {
  // Stable key derived from tool NAMES. If a caller passes a new array
  // each render, the keys are what determines the registration set —
  // not the array identity. Bodies are looked up via the ref-map so a
  // body change doesn't force a re-register.
  const namesKey = React.useMemo(
    () => tools.map((t) => t.name).sort().join("|"),
    [tools]
  );

  // Ref-map: latest bodies. Lets us re-register on name change without
  // re-registering on body change.
  const bodiesRef = React.useRef<Map<string, WebMCPToolDefinition>>(new Map());
  React.useEffect(() => {
    const map = new Map<string, WebMCPToolDefinition>();
    for (const t of tools) map.set(t.name, t);
    bodiesRef.current = map;
  }, [tools]);

  const [state, setState] = React.useState<UseWebMCPToolsResult>(EMPTY);

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const ctx = document.modelContext as WebMCPModelContext | undefined;
    if (!ctx || typeof ctx.registerTool !== "function") {
      setState({ supported: false, count: 0, pending: false });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setState((s) => ({ ...s, supported: true, pending: true, error: undefined }));

    const currentMap = bodiesRef.current;
    const toolsToRegister = Array.from(currentMap.values()).filter((t) =>
      namesKey.split("|").includes(t.name)
    );

    (async () => {
      let ok = 0;
      let firstError: string | undefined;
      for (const tool of toolsToRegister) {
        if (cancelled) return;
        try {
          await ctx.registerTool(
            {
              name: tool.name,
              title: tool.title,
              description: tool.description,
              inputSchema: tool.inputSchema,
              annotations: tool.annotations,
              // Look up the LATEST body from the ref-map at execute
              // time. The tool array is rebuilt every render (e.g. when
              // the parent state changes), so a closure captured at
              // registration time would be stale. The ref-map is
              // updated synchronously in the bodies-update effect.
              execute: async (input) => {
                const latest = bodiesRef.current.get(tool.name);
                const body = latest?.execute ?? tool.execute;
                return wrapExecute(body, input);
              },
            },
            { signal: controller.signal }
          );
          ok += 1;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // Duplicate names are a common case (e.g. hook called twice
          // from different components with overlapping tools). Log
          // once per collision.
          // eslint-disable-next-line no-console
          console.warn(`[webmcp] could not register "${tool.name}": ${msg}`);
          if (!firstError) firstError = `${tool.name}: ${msg}`;
        }
      }
      if (cancelled) return;
      setState({
        supported: true,
        count: ok,
        pending: false,
        error: firstError,
      });
    })();

    return () => {
      cancelled = true;
      controller.abort();
      setState(EMPTY);
    };
    // Re-run when the set of names changes. Tool bodies are read from
    // bodiesRef on each invocation, so a body-only update does NOT
    // force a re-register.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namesKey]);

  return state;
}
