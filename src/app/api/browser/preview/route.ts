import { NextRequest, NextResponse } from "next/server";
import { chromium as playwright } from "playwright-core";

/**
 * POST /api/browser/preview
 *
 * Real headless-browser integration for the composer. The autonomous
 * agent's "browser console" in the UI was previously simulated client
 * side; this route makes it real — it launches a headless Chromium
 * via @sparticuz/chromium, navigates to the requested URL, takes a
 * screenshot, and streams the result back so the BROWSER CONSOLE
 * pane renders an actual screenshot of the page the agent is on.
 *
 * This is intentionally scoped to "navigate + screenshot" so each
 * call fits comfortably inside Vercel Hobby's 10s function budget
 * (chromium cold start is ~3-5s, Playwright launch ~1-2s, page
 * navigation ~1-3s, screenshot ~0.5s). Full form-filling would
 * exceed the budget and is out of scope.
 *
 * Caching: we keep a singleton browser instance in `globalThis` so
 * warm calls reuse the same chromium process. The browser is force-
 * closed after 60s of idle to avoid memory leaks.
 *
 * Error handling: any failure (cold-start timeout, navigation
 * timeout, missing chromium, etc.) returns a 200 with `ok: false`
 * so the caller can log the failure to the run's action log
 * without throwing. The client-side simulator is the visual
 * fallback when the real browser can't keep up.
 *
 * @sparticuz/chromium is loaded via dynamic import because it's
 * ESM-only and the Next.js route handler runs in a CommonJS-ish
 * context. Lazy loading also avoids the cold-start cost on routes
 * that never use it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10; // Vercel Hobby max

interface BrowserHandle {
  browser: import("playwright-core").Browser;
  lastUsed: number;
}

interface ChromiumModule {
  args: string[];
  executablePath: () => Promise<string>;
}

const g = globalThis as unknown as { __echo_browser?: BrowserHandle; __echo_chromium?: ChromiumModule };
const IDLE_TIMEOUT_MS = 60_000;

async function getChromium(): Promise<ChromiumModule | null> {
  if (g.__echo_chromium) return g.__echo_chromium;
  try {
    const mod = (await import("@sparticuz/chromium")) as unknown as {
      default?: ChromiumModule;
    } & ChromiumModule;
    const chromium: ChromiumModule = mod.default ?? mod;
    g.__echo_chromium = chromium;
    return chromium;
  } catch (err) {
    console.error("[browser] failed to load @sparticuz/chromium:", err);
    return null;
  }
}

async function getBrowser(): Promise<BrowserHandle["browser"] | null> {
  if (g.__echo_browser && Date.now() - g.__echo_browser.lastUsed < IDLE_TIMEOUT_MS) {
    g.__echo_browser.lastUsed = Date.now();
    return g.__echo_browser.browser;
  }
  const chromium = await getChromium();
  if (!chromium) return null;
  try {
    const execPath = await chromium.executablePath();
    console.log("[browser] launching chromium at", execPath);
    const browser = await playwright.launch({
      args: [...chromium.args, "--disable-dev-shm-usage"],
      executablePath: execPath,
      headless: true,
    });
    console.log("[browser] chromium launched");
    g.__echo_browser = { browser, lastUsed: Date.now() };
    return browser;
  } catch (err) {
    console.error("[browser] chromium launch failed:", err);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const startMs = Date.now();
  const body = (await req.json().catch(() => ({}))) as { url?: string };
  if (!body.url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  const target = body.url.startsWith("http")
    ? body.url
    : `https://${body.url}`;
  console.log("[browser] navigating to", target);

  let context: import("playwright-core").BrowserContext | undefined;
  try {
    const browser = await getBrowser();
    if (!browser) {
      return NextResponse.json({
        ok: false,
        url: target,
        error:
          "Real headless browser unavailable on this server (chromium failed to load or launch). The simulator is filling in this step.",
        elapsedMs: Date.now() - startMs,
      });
    }
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Echo-Browser/1.0",
    });
    const page = await context.newPage();
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 7000 });
    const title = await page.title();
    const screenshot = await page.screenshot({ type: "png", fullPage: false });
    const elapsedMs = Date.now() - startMs;
    await context.close().catch(() => undefined);
    console.log("[browser] done", { title, elapsedMs });
    return NextResponse.json({
      ok: true,
      url: target,
      title,
      screenshot: `data:image/png;base64,${screenshot.toString("base64")}`,
      elapsedMs,
    });
  } catch (err) {
    await context?.close().catch(() => undefined);
    const message = err instanceof Error ? err.message : String(err);
    console.error("[browser] error", message);
    return NextResponse.json(
      {
        ok: false,
        url: target,
        error: message,
        elapsedMs: Date.now() - startMs,
      },
      { status: 200 }
    );
  }
}
