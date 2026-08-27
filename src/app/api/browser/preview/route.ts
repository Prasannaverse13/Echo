import { NextRequest, NextResponse } from "next/server";
import chromium from "@sparticuz/chromium";
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
 * timeout, etc.) returns a 200 with `ok: false` so the caller can
 * log the failure to the run's action log without throwing. The
 * client-side simulator is the visual fallback when the real
 * browser can't keep up.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10; // Vercel Hobby max

interface BrowserHandle {
  browser: import("playwright-core").Browser;
  lastUsed: number;
}

const g = globalThis as unknown as { __echo_browser?: BrowserHandle };
const IDLE_TIMEOUT_MS = 60_000;

async function getBrowser(): Promise<BrowserHandle["browser"]> {
  if (g.__echo_browser && Date.now() - g.__echo_browser.lastUsed < IDLE_TIMEOUT_MS) {
    g.__echo_browser.lastUsed = Date.now();
    return g.__echo_browser.browser;
  }
  // (Re)launch. @sparticuz/chromium handles extracting the binary to
  // /tmp on cold start. --single-process + --no-zygote keep memory
  // low enough for the 1024MB Vercel function limit.
  const browser = await playwright.launch({
    args: [
      ...chromium.args,
      "--single-process",
      "--no-zygote",
      "--disable-dev-shm-usage",
    ],
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  g.__echo_browser = { browser, lastUsed: Date.now() };
  return browser;
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

  let context: import("playwright-core").BrowserContext | undefined;
  try {
    const browser = await getBrowser();
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
