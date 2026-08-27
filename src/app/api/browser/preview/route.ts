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
 * TEMP: simplified to isolate the runtime 500 error.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10; // Vercel Hobby max

export async function POST(req: NextRequest) {
  return NextResponse.json({
    ok: true,
    message: "minimal route works",
    ts: Date.now(),
  });
}
