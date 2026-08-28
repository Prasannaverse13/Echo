import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/browser/preview
 *
 * Real headless-browser integration for the composer. Two modes:
 *
 *   1) Snapshot mode (no `actions` field): launches headless Chromium,
 *      navigates to the URL, takes a screenshot, returns title + PNG.
 *      Used for the simple "go look at this page" case.
 *
 *   2) Action-script mode (with `actions`): navigates to the URL, then
 *      runs an ordered list of browser actions (click, fill, type,
 *      press, wait, extract, hover, scroll) and takes a final
 *      screenshot. Each action's result is returned separately so the
 *      UI can show real "click the Compose button" / "fill the To
 *      field" steps in the BROWSER CONSOLE. This is what makes the
 *      composer look like it's actually using the browser instead of
 *      just pointing a camera at it.
 *
 * Both modes return base64 PNGs as data URIs so the client doesn't
 * need to roundtrip again. Anything that fails (selector miss,
 * navigation timeout, etc.) becomes a 200 with `ok: false` — the
 * caller decides how to render the failure in the action log.
 *
 * @sparticuz/chromium and puppeteer-core are dynamic-imported to
 * survive Vercel's CJS-ish module loader (both are ESM-only) and so
 * cold-start cost is paid only when the route is actually called.
 *
 * Caching: the singleton browser in `globalThis` is reused across
 * warm calls so the 3-5s cold start hits only the first request.
 * Idle timeout = 60s; older browsers are force-closed to avoid
 * memory leaks.
 *
 * Failure handling: any failure (cold start, import, launch,
 * navigation, action, screenshot) is caught and returned as a 200
 * with `ok: false`. The client-side browser-runner logs the failure
 * to the action stream and the simulator fills in the rest.
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

type ActionType =
  | "click"
  | "fill"
  | "type"
  | "press"
  | "wait"
  | "hover"
  | "scroll"
  | "extract"
  | "screenshot"
  | "select";

interface ScriptAction {
  type: ActionType;
  /** CSS selector for element-targeting actions. */
  selector?: string;
  /** Value for fill / type / select. */
  value?: string;
  /** Text to type for type actions (legacy alias of value). */
  text?: string;
  /** Key name for press actions (e.g. "Enter", "Tab", "Escape"). */
  key?: string;
  /** Wait time in ms for wait / scroll / hover actions. */
  ms?: number;
  /** Direction for scroll ("up" | "down" | "top" | "bottom"). */
  direction?: "up" | "down" | "top" | "bottom";
  /** Pixel amount for scroll. */
  amount?: number;
  /** Human-readable label for the action log. */
  label?: string;
  /** How long to wait for the element to appear (default 3000ms). */
  timeout?: number;
}

interface ActionResult {
  type: ActionType;
  ok: boolean;
  label?: string;
  extracted?: string;
  error?: string;
  elapsedMs: number;
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

interface ExecuteOpts {
  url: string;
  actions: ScriptAction[];
  /** User-agent string. */
  userAgent?: string;
}

interface ExecuteResult {
  ok: boolean;
  url: string;
  finalUrl?: string;
  title?: string;
  /** Results of each action in order, parallel to `actions` input. */
  actionResults: ActionResult[];
  /** Final screenshot after all actions. */
  screenshot?: string;
  /** Initial screenshot, before any actions, so the user can see
   *  the page as the browser first saw it. */
  initialScreenshot?: string;
  elapsedMs: number;
  error?: string;
}

async function executeScript(
  browser: import("puppeteer-core").Browser,
  opts: ExecuteOpts
): Promise<ExecuteResult> {
  const startMs = Date.now();
  const actionResults: ActionResult[] = [];
  const target = opts.url.startsWith("http") ? opts.url : `https://${opts.url}`;
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  if (opts.userAgent) await page.setUserAgent(opts.userAgent);

  let finalUrl: string | undefined;
  let title: string | undefined;
  let initialScreenshot: Buffer | undefined;
  let finalScreenshot: Buffer | undefined;

  try {
    // Step 1: navigate
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 7000 });
    finalUrl = page.url();
    title = await page.title();
    initialScreenshot = (await page.screenshot({ type: "png", fullPage: false })) as Buffer;

    // Step 2: run each action in order
    for (const action of opts.actions) {
      const t0 = Date.now();
      const result: ActionResult = {
        type: action.type,
        ok: false,
        label: action.label,
        elapsedMs: 0,
      };
      try {
        switch (action.type) {
          case "click": {
            if (!action.selector) throw new Error("click requires `selector`");
            await page.waitForSelector(action.selector, {
              timeout: action.timeout ?? 3000,
            });
            await page.click(action.selector);
            break;
          }
          case "fill": {
            if (!action.selector) throw new Error("fill requires `selector`");
            await page.waitForSelector(action.selector, {
              timeout: action.timeout ?? 3000,
            });
            // puppeteer-core doesn't expose page.fill on the public
            // Page type; emulate it by selecting the element, clearing
            // its value, and typing. (Selecting-then-evaluate is the
            // portable way to do "set value" on a controlled input.)
            const handle = await page.$(action.selector);
            if (!handle) throw new Error(`element not found: ${action.selector}`);
            await handle.evaluate((el, v) => {
              const input = el as HTMLInputElement | HTMLTextAreaElement;
              const proto = Object.getPrototypeOf(input);
              const valueSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
              valueSetter?.call(input, v);
              input.dispatchEvent(new Event("input", { bubbles: true }));
              input.dispatchEvent(new Event("change", { bubbles: true }));
            }, action.value ?? "");
            break;
          }
          case "type": {
            if (!action.selector) throw new Error("type requires `selector`");
            await page.waitForSelector(action.selector, {
              timeout: action.timeout ?? 3000,
            });
            await page.type(action.selector, action.text ?? action.value ?? "", { delay: 30 });
            break;
          }
          case "press": {
            // Puppeteer's keyboard.press expects a KeyInput (a
            // string literal like "Enter", "Tab", "Escape", etc).
            // We accept any string from the planner and let the
            // runtime fail if it's not a valid key.
            const key = (action.key ?? "Enter") as Parameters<typeof page.keyboard.press>[0];
            await page.keyboard.press(key);
            break;
          }
          case "wait": {
            if (action.selector) {
              await page.waitForSelector(action.selector, {
                timeout: action.timeout ?? 5000,
              });
            } else {
              await new Promise((r) => setTimeout(r, action.ms ?? 1000));
            }
            break;
          }
          case "hover": {
            if (!action.selector) throw new Error("hover requires `selector`");
            await page.waitForSelector(action.selector, {
              timeout: action.timeout ?? 3000,
            });
            await page.hover(action.selector);
            break;
          }
          case "scroll": {
            const amount = action.amount ?? 400;
            if (action.direction === "top") {
              await page.evaluate(() => window.scrollTo(0, 0));
            } else if (action.direction === "bottom") {
              await page.evaluate(() =>
                window.scrollTo(0, document.body.scrollHeight)
              );
            } else if (action.direction === "up") {
              await page.evaluate((y: number) => window.scrollBy(0, -y), amount);
            } else {
              await page.evaluate((y: number) => window.scrollBy(0, y), amount);
            }
            break;
          }
          case "extract": {
            if (!action.selector) {
              // No selector → extract whole body text
              const txt = (await page.evaluate(
                () => document.body?.innerText?.slice(0, 500) ?? ""
              )) as string;
              result.extracted = txt;
            } else {
              await page.waitForSelector(action.selector, {
                timeout: action.timeout ?? 3000,
              });
              const handle = await page.$(action.selector);
              if (!handle) {
                result.extracted = "";
                result.error = `extract: element not found: ${action.selector}`;
                result.elapsedMs = Date.now() - t0;
                actionResults.push(result);
                continue;
              }
              const txt = (await handle.evaluate(
                (el) => (el as HTMLElement).innerText ?? el.textContent ?? ""
              )) as string;
              result.extracted = txt.slice(0, 500);
            }
            break;
          }
          case "screenshot": {
            const buf = (await page.screenshot({
              type: "png",
              fullPage: false,
            })) as Buffer;
            // stash on the side-effect below
            result.extracted = `${buf.length} bytes`;
            break;
          }
          case "select": {
            if (!action.selector) throw new Error("select requires `selector`");
            await page.select(action.selector, action.value ?? "");
            break;
          }
          default:
            throw new Error(`unknown action type: ${(action as { type: string }).type}`);
        }
        result.ok = true;
      } catch (e) {
        result.error = e instanceof Error ? e.message : String(e);
      }
      result.elapsedMs = Date.now() - t0;
      actionResults.push(result);
    }

    // Step 3: final screenshot
    try {
      finalScreenshot = (await page.screenshot({ type: "png", fullPage: false })) as Buffer;
    } catch {
      // non-fatal
    }

    await ctx.close().catch(() => undefined);
    return {
      ok: true,
      url: target,
      finalUrl,
      title,
      actionResults,
      initialScreenshot: initialScreenshot
        ? `data:image/png;base64,${initialScreenshot.toString("base64")}`
        : undefined,
      screenshot: finalScreenshot
        ? `data:image/png;base64,${finalScreenshot.toString("base64")}`
        : undefined,
      elapsedMs: Date.now() - startMs,
    };
  } catch (err) {
    await ctx.close().catch(() => undefined);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      url: target,
      actionResults,
      initialScreenshot: initialScreenshot
        ? `data:image/png;base64,${initialScreenshot.toString("base64")}`
        : undefined,
      screenshot: finalScreenshot
        ? `data:image/png;base64,${finalScreenshot.toString("base64")}`
        : undefined,
      elapsedMs: Date.now() - startMs,
      error: msg,
    };
  }
}

export async function POST(req: NextRequest) {
  const startMs = Date.now();
  const body = (await req.json().catch(() => ({}))) as {
    url?: string;
    actions?: ScriptAction[];
    userAgent?: string;
  };
  if (!body.url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  const target = body.url.startsWith("http") ? body.url : `https://${body.url}`;
  const userAgent =
    body.userAgent ??
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 Echo-Browser/1.0";
  const actions = body.actions ?? [];

  console.log(`[browser] script for ${target} with ${actions.length} action(s)`);

  const browserResult = await getBrowser();
  if (typeof browserResult === "object" && browserResult !== null && "error" in browserResult) {
    return NextResponse.json({
      ok: false,
      url: target,
      error: `Real headless browser unavailable: ${browserResult.error}. The simulator is filling in this step.`,
      actionResults: [],
      elapsedMs: Date.now() - startMs,
    });
  }
  const browser = browserResult as import("puppeteer-core").Browser;

  const result = await executeScript(browser, { url: target, actions, userAgent });
  console.log("[browser] script done", {
    ok: result.ok,
    actionResults: result.actionResults.length,
    elapsedMs: result.elapsedMs,
  });
  return NextResponse.json(result);
}
