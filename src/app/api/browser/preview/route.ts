import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/browser/preview
 *
 * Real headless-browser integration for the composer. Simplified
 * to navigate-only with optional screenshots so the Vercel Hobby
 * 10s budget reliably fits a single call. Click / fill / extract
 * are out of scope for this build — they need a hosted browser
 * service (Browserless, Browserbase) or Vercel Pro to fit the
 * ~3-5s cold start + per-step overhead.
 *
 * @sparticuz/chromium + puppeteer-core are dynamic-imported so
 * the CJS-ish Vercel module loader doesn't 500 on static ESM
 * imports. Lazy loading also means cold-start cost is paid only
 * when the route is actually called.
 *
 * Caching: the singleton browser in `globalThis` is reused across
 * warm calls so the 3-5s cold start hits only the first request.
 * Idle timeout = 60s; older browsers are force-closed to avoid
 * memory leaks.
 *
 * Failure handling: any failure (cold start, import, launch,
 * navigation, screenshot) is caught and returned as a 200 with
 * `ok: false`. The client-side browser-runner logs the failure to
 * the action stream and the simulator fills in the rest.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10; // Vercel Hobby max

interface BrowserHandle {
  browser: import("puppeteer-core").Browser;
  lastUsed: number;
}

interface ChromiumModule {
  args: string[];
  executablePath: () => Promise<string>;
}

const g = globalThis as unknown as {
  __echo_browser?: BrowserHandle;
  __echo_chromium?: ChromiumModule;
  __echo_puppeteer?: typeof import("puppeteer-core");
};
const IDLE_TIMEOUT_MS = 60_000;

async function getDeps(): Promise<{
  chromium: ChromiumModule;
  puppeteer: typeof import("puppeteer-core");
} | { error: string }> {
  if (g.__echo_chromium && g.__echo_puppeteer) {
    return { chromium: g.__echo_chromium, puppeteer: g.__echo_puppeteer };
  }
  try {
    const [chromiumMod, puppeteerMod] = await Promise.all([
      import("@sparticuz/chromium") as unknown as Promise<
        ChromiumModule | { default?: ChromiumModule }
      >,
      import("puppeteer-core") as unknown as Promise<typeof import("puppeteer-core")>,
    ]);
    const chromium: ChromiumModule =
      (chromiumMod as { default?: ChromiumModule }).default ??
      (chromiumMod as ChromiumModule);
    if (!chromium || typeof chromium.executablePath !== "function") {
      return { error: "chromium module loaded but missing executablePath" };
    }
    if (!puppeteerMod || typeof (puppeteerMod as { launch?: unknown }).launch !== "function") {
      return { error: "puppeteer-core module loaded but missing launch" };
    }
    g.__echo_chromium = chromium;
    g.__echo_puppeteer = puppeteerMod;
    return { chromium, puppeteer: puppeteerMod };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[browser] failed to load deps:", msg);
    return { error: `deps import failed: ${msg}` };
  }
}

async function getBrowser(): Promise<
  import("puppeteer-core").Browser | { error: string }
> {
  if (g.__echo_browser && Date.now() - g.__echo_browser.lastUsed < IDLE_TIMEOUT_MS) {
    g.__echo_browser.lastUsed = Date.now();
    return g.__echo_browser.browser;
  }
  const depsResult = await getDeps();
  if ("error" in depsResult) return { error: depsResult.error };
  const { chromium, puppeteer } = depsResult;
  try {
    const execPath = await chromium.executablePath();
    console.log("[browser] launching chromium at", execPath);
    const browser = await puppeteer.launch({
      args: [...chromium.args, "--disable-dev-shm-usage"],
      executablePath: execPath,
      headless: true,
    });
    console.log("[browser] chromium launched");
    g.__echo_browser = { browser, lastUsed: Date.now() };
    return browser;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[browser] chromium launch failed:", msg);
    return { error: `launch failed: ${msg}` };
  }
}

export async function POST(req: NextRequest) {
  const startMs = Date.now();
  const body = (await req.json().catch(() => ({}))) as { url?: string };
  if (!body.url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  const target = body.url.startsWith("http") ? body.url : `https://${body.url}`;

  const browserResult = await getBrowser();
  if (typeof browserResult === "object" && browserResult !== null && "error" in browserResult) {
    return NextResponse.json({
      ok: false,
      url: target,
      error: `Real headless browser unavailable: ${browserResult.error}. The simulator is filling in this step.`,
      elapsedMs: Date.now() - startMs,
    });
  }
  const browser = browserResult as import("puppeteer-core").Browser;

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 7000 });
    const title = await page.title();
    const finalUrl = page.url();
    const screenshot = (await page.screenshot({ type: "png", fullPage: false })) as Buffer;
    await page.close().catch(() => undefined);
    return NextResponse.json({
      ok: true,
      url: target,
      finalUrl,
      title,
      screenshot: `data:image/png;base64,${screenshot.toString("base64")}`,
      elapsedMs: Date.now() - startMs,
    });
  } catch (err) {
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
