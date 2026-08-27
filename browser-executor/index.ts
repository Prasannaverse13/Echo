/**
 * Echo Browser Executor
 *
 * A Playwright-backed headless browser that the Echo ADK agent (in the
 * worker) controls over HTTP. Lets the agent actually do the workflows
 * the user recorded — open Gmail, draft an email, save it; open a sheet,
 * paste rows, etc. — instead of just hallucinating the result.
 *
 * Why a separate service?
 *   - Vercel serverless functions can't run Chromium (size + lifetime
 *     limits). The browser needs a long-running process with a
 *     ~300 MB Chromium install.
 *   - Cloud Run can. This service deploys there as `echo-browser`.
 *   - The worker (also on Cloud Run) calls it via the
 *     `BROWSER_EXECUTOR_URL` env var.
 *
 * Endpoints:
 *   GET  /healthz              — liveness for Cloud Run
 *   POST /execute              — run a list of browser actions, return results
 *   POST /screenshot            — one-shot screenshot of a URL (helper)
 *
 * Action shape (see src/lib/browser-executor.ts for the canonical types):
 *   { type: "navigate",   url: "https://..." }
 *   { type: "click",      selector: "...", optional: { button, delay, ... } }
 *   { type: "fill",       selector: "...", value: "..." }
 *   { type: "type",       selector: "...", text: "..." }       // type with delay
 *   { type: "press",      selector: "...", key: "Enter" }      // keyboard
 *   { type: "extract",    selector: "...", attribute: "text" | "innerText" | "value" | "html" | "href" | ... }
 *   { type: "wait",       selector?: "...", ms?: 1000 }        // wait for selector or ms
 *   { type: "screenshot", fullPage?: boolean }                 // return PNG
 *   { type: "scroll",     direction: "up"|"down", amount: 400 }
 *
 * Response:
 *   {
 *     ok: true,
 *     results: [{ action, ok, value?, error? }, ...],
 *     screenshot?: "data:image/png;base64,...",   // last screenshot
 *     url: "...",                                   // current page URL
 *     title: "...",                                 // current page title
 *   }
 */

import express, { Request, Response } from "express";
import { chromium, Browser, BrowserContext, Page } from "playwright";
import { Firestore } from "@google-cloud/firestore";

// ---------- Config ----------

const PORT = Number(process.env.PORT || 8080);
const PROJECT_ID =
  process.env.GCP_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  "echo-hackathon-2026";
const HEADLESS = process.env.BROWSER_HEADLESS !== "false"; // default true
const SESSION_TIMEOUT_MS = Number(process.env.BROWSER_SESSION_TIMEOUT_MS || 5 * 60 * 1000); // 5m
const NAV_TIMEOUT_MS = Number(process.env.BROWSER_NAV_TIMEOUT_MS || 30_000);
const ACTION_TIMEOUT_MS = Number(process.env.BROWSER_ACTION_TIMEOUT_MS || 15_000);

const firestore = new Firestore({ projectId: PROJECT_ID });

// ---------- Action types ----------

type BrowserAction =
  | { type: "navigate"; url: string }
  | { type: "click"; selector: string; optional?: Record<string, unknown> }
  | { type: "fill"; selector: string; value: string }
  | { type: "type"; selector: string; text: string; delayMs?: number }
  | { type: "press"; selector?: string; key: string }
  | { type: "extract"; selector: string; attribute?: string }
  | { type: "wait"; selector?: string; ms?: number }
  | { type: "screenshot"; fullPage?: boolean }
  | { type: "scroll"; direction: "up" | "down"; amount?: number };

type ActionResult = {
  action: BrowserAction;
  ok: boolean;
  value?: unknown;
  error?: string;
};

type ExecuteResponse = {
  ok: boolean;
  runId?: string;
  inputId?: string;
  results: ActionResult[];
  url?: string;
  title?: string;
  screenshot?: string;
  error?: string;
};

// ---------- Per-run browser session ----------

interface Session {
  runId: string;
  inputId: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  createdAt: number;
}

const sessions = new Map<string, Session>();

function sessionKey(runId: string, inputId: string): string {
  return `${runId}::${inputId}`;
}

async function getOrCreateSession(runId: string, inputId: string): Promise<Session> {
  const key = sessionKey(runId, inputId);
  const existing = sessions.get(key);
  if (existing) {
    existing.createdAt = Date.now();
    return existing;
  }
  const browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(ACTION_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);
  const session: Session = { runId, inputId, browser, context, page, createdAt: Date.now() };
  sessions.set(key, session);
  return session;
}

async function destroySession(key: string): Promise<void> {
  const s = sessions.get(key);
  if (!s) return;
  sessions.delete(key);
  try {
    await s.context.close().catch(() => undefined);
    await s.browser.close().catch(() => undefined);
  } catch {
    // best effort
  }
}

// GC idle sessions
setInterval(() => {
  const now = Date.now();
  for (const [key, s] of sessions) {
    if (now - s.createdAt > SESSION_TIMEOUT_MS) {
      console.log(`[browser-executor] Gcing idle session ${key}`);
      destroySession(key);
    }
  }
}, 60_000).unref();

// ---------- Action execution ----------

async function runOne(page: Page, action: BrowserAction): Promise<ActionResult> {
  try {
    switch (action.type) {
      case "navigate": {
        const resp = await page.goto(action.url, { waitUntil: "domcontentloaded" });
        return { action, ok: true, value: { status: resp?.status() ?? null, finalUrl: page.url() } };
      }
      case "click": {
        await page.click(action.selector, (action.optional as Parameters<Page["click"]>[1]) ?? undefined);
        return { action, ok: true };
      }
      case "fill": {
        await page.fill(action.selector, action.value);
        return { action, ok: true };
      }
      case "type": {
        await page.type(action.selector, action.text, { delay: action.delayMs ?? 30 });
        return { action, ok: true };
      }
      case "press": {
        if (action.selector) {
          await page.press(action.selector, action.key);
        } else {
          await page.keyboard.press(action.key);
        }
        return { action, ok: true };
      }
      case "extract": {
        const attr = action.attribute ?? "text";
        const values = await page.$$eval(
          action.selector,
          (els, a) => {
            const read = (el: Element): string | null => {
              const e = el as HTMLElement;
              switch (a) {
                case "text":
                  return e.textContent;
                case "innerText":
                  return e.innerText;
                case "value":
                  return (e as HTMLInputElement).value ?? null;
                case "html":
                  return e.innerHTML;
                case "href":
                  return (e as HTMLAnchorElement).href;
                default:
                  return e.getAttribute(a ?? "text");
              }
            };
            return els.map((el) => read(el));
          },
          attr
        );
        return { action, ok: true, value: values };
      }
      case "wait": {
        if (action.selector) {
          await page.waitForSelector(action.selector, { timeout: ACTION_TIMEOUT_MS });
        } else if (action.ms) {
          await page.waitForTimeout(action.ms);
        }
        return { action, ok: true };
      }
      case "screenshot": {
        const buf = await page.screenshot({
          fullPage: action.fullPage ?? false,
          type: "png",
        });
        return { action, ok: true, value: { bytes: buf.length, dataUrl: `data:image/png;base64,${buf.toString("base64")}` } };
      }
      case "scroll": {
        const amount = action.amount ?? 400;
        await page.evaluate(
          ({ dir, amt }: { dir: "up" | "down"; amt: number }) => {
            window.scrollBy({ top: dir === "down" ? amt : -amt, behavior: "smooth" });
          },
          { dir: action.direction, amt: amount }
        );
        return { action, ok: true };
      }
      default: {
        // Exhaustiveness check
        const unknown: never = action;
        return { action, ok: false, error: `Unknown action type: ${JSON.stringify(unknown)}` };
      }
    }
  } catch (err) {
    return { action, ok: false, error: (err as Error).message };
  }
}

// ---------- HTTP server ----------

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    role: "echo-browser-executor",
    sessions: sessions.size,
    headless: HEADLESS,
    project: PROJECT_ID,
    ts: Date.now(),
  });
});

app.post("/execute", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    runId?: string;
    inputId?: string;
    actions?: BrowserAction[];
  };
  const runId = body.runId;
  const inputId = body.inputId;
  const actions = Array.isArray(body.actions) ? body.actions : [];

  if (!runId || !inputId) {
    res.status(400).json({ ok: false, error: "runId and inputId are required", results: [] });
    return;
  }
  if (actions.length === 0) {
    res.status(400).json({ ok: false, error: "actions[] must be non-empty", results: [] });
    return;
  }
  if (actions.length > 100) {
    res.status(400).json({ ok: false, error: "actions[] capped at 100 per call", results: [] });
    return;
  }

  const session = await getOrCreateSession(runId, inputId);
  const { page } = session;
  const results: ActionResult[] = [];
  let lastScreenshot: string | undefined;

  for (const action of actions) {
    const r = await runOne(page, action);
    results.push(r);
    if (action.type === "screenshot" && r.ok && r.value && typeof r.value === "object" && "dataUrl" in r.value) {
      lastScreenshot = (r.value as { dataUrl: string }).dataUrl;
    }
    // Stop on first hard failure (action.ok === false) so the agent sees it
    if (!r.ok) {
      break;
    }
  }

  // Best-effort persist the last screenshot to Firestore for the dashboard
  if (lastScreenshot) {
    firestore
      .collection("runs")
      .doc(runId)
      .collection("screenshots")
      .doc(inputId)
      .set({ dataUrl: lastScreenshot, at: new Date().toISOString() })
      .catch(() => undefined);
  }

  const response: ExecuteResponse = {
    ok: true,
    runId,
    inputId,
    results,
    url: page.url(),
    title: await page.title().catch(() => ""),
    screenshot: lastScreenshot,
  };
  res.json(response);
});

app.post("/screenshot", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { runId?: string; inputId?: string; url?: string };
  const { runId, inputId, url } = body;
  if (!runId || !inputId || !url) {
    res.status(400).json({ ok: false, error: "runId, inputId, url are required" });
    return;
  }
  const session = await getOrCreateSession(runId, inputId);
  await session.page.goto(url, { waitUntil: "domcontentloaded" });
  const buf = await session.page.screenshot({ type: "png" });
  res.json({
    ok: true,
    runId,
    inputId,
    url: session.page.url(),
    title: await session.page.title().catch(() => ""),
    screenshot: `data:image/png;base64,${buf.toString("base64")}`,
  });
});

app.post("/session/end", async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { runId?: string; inputId?: string };
  const { runId, inputId } = body;
  if (!runId || !inputId) {
    res.status(400).json({ ok: false, error: "runId and inputId required" });
    return;
  }
  await destroySession(sessionKey(runId, inputId));
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(
    `[browser-executor] listening on :${PORT} headless=${HEADLESS} project=${PROJECT_ID}`
  );
});
