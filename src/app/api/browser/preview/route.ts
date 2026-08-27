import { NextRequest, NextResponse } from "next/server";

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
 * Stack: @sparticuz/chromium + puppeteer-core. Both are dynamic-
 * imported inside the route handler because they're ESM-only and
 * Vercel's CJS-ish module loader can't handle static imports of
 * them (proven via multiple 500s during integration). Lazy import
 * also means cold-start cost is paid only when the route is hit.
 *
 * Failure handling: any failure (cold start, import, launch,
 * navigation) is caught and returned as a 200 with `ok: false`.
 * The client-side browser-runner logs the failure to the action
 * stream and the simulator fills in the rest.
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
  __echo_import_attempted?: boolean;
};
const IDLE_TIMEOUT_MS = 60_000;

async function getDeps(): Promise<{
  chromium: ChromiumModule;
  puppeteer: typeof import("puppeteer-core");
} | { error: string }> {
  if (g.__echo_chromium && g.__echo_puppeteer) {
    return { chromium: g.__echo_chromium, puppeteer: g.__echo_puppeteer };
  }
  g.__echo_import_attempted = true;
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
  BrowserHandle["browser"] | { error: string }
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
  const target = body.url.startsWith("http")
    ? body.url
    : `https://${body.url}`;
  console.log("[browser] navigating to", target);

  let page: import("puppeteer-core").Page | undefined;
  try {
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
    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Echo-Browser/1.0"
    );
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 7000 });
    const title = await page.title();
    const screenshot = (await page.screenshot({ type: "png", fullPage: false })) as Buffer;
    const elapsedMs = Date.now() - startMs;
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
    console.log("[browser] done", { title, elapsedMs });
    return NextResponse.json({
      ok: true,
      url: target,
      title,
      screenshot: `data:image/png;base64,${screenshot.toString("base64")}`,
      elapsedMs,
    });
  } catch (err) {
    if (page) await page.close().catch(() => undefined);
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
