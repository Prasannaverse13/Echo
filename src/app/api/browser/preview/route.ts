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
 * @sparticuz/chromium and playwright-core are both ESM-only; static
 * imports of them at the top of the route caused a Vercel runtime
 * 500. We load both via dynamic import inside the route handler so
 * the module load succeeds regardless. Any failure at import or
 * launch time becomes a 200 with ok:false that the browser-runner
 * logs as "Browser call failed" — the simulator fills in the rest.
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

const g = globalThis as unknown as {
  __echo_browser?: BrowserHandle;
  __echo_chromium?: ChromiumModule;
  __echo_playwright?: typeof import("playwright-core").chromium;
  __echo_import_attempted?: boolean;
};
const IDLE_TIMEOUT_MS = 60_000;

async function getDeps(): Promise<{
  chromium: ChromiumModule;
  playwright: typeof import("playwright-core").chromium;
} | null> {
  if (g.__echo_chromium && g.__echo_playwright) {
    return { chromium: g.__echo_chromium, playwright: g.__echo_playwright };
  }
  if (g.__echo_import_attempted) return null;
  g.__echo_import_attempted = true;
  try {
    const [chromiumMod, playwrightMod] = await Promise.all([
      import("@sparticuz/chromium") as unknown as Promise<
        ChromiumModule | { default?: ChromiumModule }
      >,
      import("playwright-core") as unknown as Promise<{
        chromium?: typeof import("playwright-core").chromium;
      }>,
    ]);
    const chromium: ChromiumModule =
      (chromiumMod as { default?: ChromiumModule }).default ??
      (chromiumMod as ChromiumModule);
    const playwright = (playwrightMod as { chromium?: typeof import("playwright-core").chromium })
      .chromium;
    if (!chromium || !playwright) return null;
    g.__echo_chromium = chromium;
    g.__echo_playwright = playwright;
    return { chromium, playwright };
  } catch (err) {
    console.error("[browser] failed to load deps:", err);
    return null;
  }
}

async function getBrowser(): Promise<BrowserHandle["browser"] | null> {
  if (g.__echo_browser && Date.now() - g.__echo_browser.lastUsed < IDLE_TIMEOUT_MS) {
    g.__echo_browser.lastUsed = Date.now();
    return g.__echo_browser.browser;
  }
  const deps = await getDeps();
  if (!deps) return null;
  try {
    const execPath = await deps.chromium.executablePath();
    console.log("[browser] launching chromium at", execPath);
    const browser = await deps.playwright.launch({
      args: [...deps.chromium.args, "--disable-dev-shm-usage"],
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
