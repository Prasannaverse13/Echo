/**
 * Browser executor — shared types + HTTP client.
 *
 * The Echo ADK agent (in the worker) calls a Playwright-backed
 * headless browser via this client to actually do the workflow
 * the user recorded. The browser lives in a separate Cloud Run
 * service (`echo-browser`) so Chromium doesn't bloat the Vercel
 * deploy.
 *
 *   Worker ──HTTP──▶ echo-browser ──Playwright──▶ real browser
 *
 * In dev (or when `BROWSER_EXECUTOR_URL` is unset), the client
 * falls back to a built-in mock that returns synthetic success
 * responses + a tiny inline PNG, so the agent loop still runs
 * end-to-end without any external service.
 */

export type BrowserAction =
  | { type: "navigate"; url: string }
  | { type: "click"; selector: string; optional?: Record<string, unknown> }
  | { type: "fill"; selector: string; value: string }
  | { type: "type"; selector: string; text: string; delayMs?: number }
  | { type: "press"; selector?: string; key: string }
  | { type: "extract"; selector: string; attribute?: string }
  | { type: "wait"; selector?: string; ms?: number }
  | { type: "screenshot"; fullPage?: boolean }
  | { type: "scroll"; direction: "up" | "down"; amount?: number };

export type BrowserActionResult = {
  action: BrowserAction;
  ok: boolean;
  value?: unknown;
  error?: string;
};

export type BrowserExecuteResponse = {
  ok: boolean;
  runId: string;
  inputId: string;
  results: BrowserActionResult[];
  url?: string;
  title?: string;
  screenshot?: string; // data:image/png;base64,...
  error?: string;
};

const BROWSER_EXECUTOR_URL =
  process.env.BROWSER_EXECUTOR_URL ||
  process.env.ECHO_BROWSER_URL ||
  "";

/**
 * Returns true if the real browser executor is reachable. The agent
 * uses this to decide whether to call the live service or the mock.
 */
export function browserExecutorEnabled(): boolean {
  return Boolean(BROWSER_EXECUTOR_URL);
}

/**
 * Execute a batch of browser actions against the given (runId, inputId)
 * session. Sessions persist across calls so the agent can chain steps.
 */
export async function executeBrowserActions(
  runId: string,
  inputId: string,
  actions: BrowserAction[],
  opts: { timeoutMs?: number; fetcher?: typeof fetch } = {}
): Promise<BrowserExecuteResponse> {
  if (!browserExecutorEnabled()) {
    return mockBrowserExecutor(runId, inputId, actions);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 60_000);
  const f = opts.fetcher ?? fetch;
  try {
    const resp = await f(`${BROWSER_EXECUTOR_URL.replace(/\/$/, "")}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, inputId, actions }),
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "(no body)");
      return {
        ok: false,
        runId,
        inputId,
        results: actions.map((a) => ({ action: a, ok: false, error: `executor returned ${resp.status}: ${text.slice(0, 300)}` })),
        error: `executor returned ${resp.status}`,
      };
    }
    return (await resp.json()) as BrowserExecuteResponse;
  } catch (err) {
    return {
      ok: false,
      runId,
      inputId,
      results: actions.map((a) => ({ action: a, ok: false, error: (err as Error).message })),
      error: (err as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function endBrowserSession(
  runId: string,
  inputId: string,
  opts: { fetcher?: typeof fetch } = {}
): Promise<void> {
  if (!browserExecutorEnabled()) return;
  const f = opts.fetcher ?? fetch;
  try {
    await f(`${BROWSER_EXECUTOR_URL.replace(/\/$/, "")}/session/end`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId, inputId }),
    });
  } catch {
    // best effort
  }
}

// ---------- Mock (dev / no-executor) ----------

// 1×1 black PNG, ~70 bytes
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

async function mockBrowserExecutor(
  runId: string,
  inputId: string,
  actions: BrowserAction[]
): Promise<BrowserExecuteResponse> {
  const results: BrowserActionResult[] = [];
  let url = "about:blank";
  let title = "Echo Mock Browser";
  let lastScreenshot: string | undefined;

  for (const action of actions) {
    switch (action.type) {
      case "navigate":
        url = action.url;
        title = `Mock: ${safeHost(action.url)}`;
        results.push({ action, ok: true, value: { status: 200, finalUrl: url } });
        break;
      case "click":
      case "fill":
      case "type":
      case "press":
      case "scroll":
      case "wait":
        results.push({ action, ok: true, value: "mock:ok" });
        break;
      case "extract":
        results.push({ action, ok: true, value: ["mock:value-1", "mock:value-2"] });
        break;
      case "screenshot":
        lastScreenshot = TINY_PNG;
        results.push({ action, ok: true, value: { bytes: 70, dataUrl: TINY_PNG } });
        break;
      default:
        results.push({ action, ok: false, error: "mock:unknown action" });
    }
  }
  return {
    ok: true,
    runId,
    inputId,
    results,
    url,
    title,
    screenshot: lastScreenshot,
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
