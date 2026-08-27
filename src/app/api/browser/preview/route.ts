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
 * Step 2: just add the playwright-core import and a try-catch around
 * everything to see if the import itself is the issue.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function POST(req: NextRequest) {
  try {
    console.log("[browser] route entered, playwright loaded:", typeof playwright);
    return NextResponse.json({
      ok: true,
      message: "playwright-core import works",
      playwrightType: typeof playwright,
      playwrightLaunchType: typeof playwright?.launch,
      ts: Date.now(),
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 200 });
  }
}
