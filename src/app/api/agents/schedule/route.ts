import { NextRequest, NextResponse } from "next/server";
import { readCollection, writeDoc, deleteDoc, isGcpAvailable } from "@/lib/gcp";

/**
 * POST /api/agents/schedule
 *   Create a scheduled run. Body:
 *     {
 *       name: string,
 *       goal: string,
 *       cron?: string,                 // cron expression; default "every Monday at 9am"
 *       skillLibrary?: [...],          // optional override
 *       inputsFetcher?: { kind: "static", values: any[] } | { kind: "url", url: string },
 *       enabled?: boolean,
 *     }
 *
 *   Stores in Firestore `schedules/{id}` (or in localStorage in demo).
 *   Returns { id, nextRunAt, ... }.
 *
 * GET /api/agents/schedule
 *   Lists all schedules for the current user.
 *
 * DELETE /api/agents/schedule?id=...
 *   Cancels a schedule.
 */

const DEFAULT_CRON = "0 9 * * 1"; // every Monday 9am
const USER_HEADER = "x-echo-user"; // clients pass echo.users[0] for now

interface ScheduleDoc {
  id: string;
  userId: string;
  name: string;
  goal: string;
  cron: string;
  skillLibrary?: Array<{ id: string; name: string; description: string }>;
  inputsFetcher?: { kind: "static"; values: unknown[] } | { kind: "url"; url: string };
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  lastRunId?: string;
  nextRunAt?: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<ScheduleDoc>;
  if (!body.name || !body.goal) {
    return NextResponse.json(
      { error: "name and goal are required" },
      { status: 400 }
    );
  }
  const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const userId = req.headers.get(USER_HEADER) || "anon";
  const now = new Date().toISOString();
  const cron = body.cron || DEFAULT_CRON;
  const doc: ScheduleDoc = {
    id,
    userId,
    name: body.name,
    goal: body.goal,
    cron,
    skillLibrary: body.skillLibrary,
    inputsFetcher: body.inputsFetcher,
    enabled: body.enabled ?? true,
    createdAt: now,
    nextRunAt: nextRunFromCron(cron, new Date()).toISOString(),
  };
  if (isGcpAvailable()) {
    await writeDoc("schedules", id, doc as unknown as Record<string, unknown>).catch(
      () => undefined
    );
  }
  return NextResponse.json({ ok: true, schedule: doc });
}

export async function GET(req: NextRequest) {
  const userId = req.headers.get(USER_HEADER) || "anon";
  if (isGcpAvailable()) {
    const all = await readCollection("schedules").catch(() => []);
    return NextResponse.json({
      ok: true,
      source: "firestore",
      schedules: all.filter(
        (s) => (s as unknown as ScheduleDoc).userId === userId || userId === "anon"
      ),
    });
  }
  return NextResponse.json({ ok: true, source: "none", schedules: [] });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }
  if (isGcpAvailable()) {
    await deleteDoc("schedules", id).catch(() => undefined);
  }
  return NextResponse.json({ ok: true, id });
}

// ---------- Cron helpers ----------

/**
 * Compute the next Date the given cron expression will fire after `from`.
 * Supports the 5-field POSIX cron subset Echo actually needs:
 *   minute (0-59), hour (0-23), day-of-month (1-31), month (1-12), day-of-week (0-6, Sun=0)
 *
 * No special chars beyond asterisk and comma. Good enough for
 * Vercel Cron expressions like "0 9 (star) (star) 1" (every Monday 9am)
 * or "(star-slash)15 (star) (star) (star) (star)" (every 15 min).
 */
export function nextRunFromCron(cron: string, from: Date): Date {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    // Fall back to "in 1 minute" if we can't parse
    return new Date(from.getTime() + 60_000);
  }
  const [minSpec, hourSpec, domSpec, monSpec, dowSpec] = parts;

  const next = new Date(from.getTime());
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1); // start at the next minute boundary after `from`

  for (let i = 0; i < 366 * 24 * 60; i++) {
    if (matchesField(next.getMinutes(), minSpec) &&
        matchesField(next.getHours(),   hourSpec) &&
        matchesField(next.getDate(),     domSpec) &&
        matchesField(next.getMonth() + 1, monSpec) &&
        matchesDOW(next.getDay(),       dowSpec)) {
      return next;
    }
    next.setMinutes(next.getMinutes() + 1);
  }
  // Safety: if we get here, the cron is very weird
  return new Date(from.getTime() + 24 * 60 * 60 * 1000);
}

function matchesField(value: number, spec: string): boolean {
  return spec.split(",").some((part) => {
    if (part === "*") return true;
    if (part.startsWith("*/")) {
      const step = Number(part.slice(2));
      if (!Number.isFinite(step) || step <= 0) return false;
      return value % step === 0;
    }
    if (part.includes("-")) {
      const [lo, hi] = part.split("-").map(Number);
      return value >= lo && value <= hi;
    }
    return Number(part) === value;
  });
}

function matchesDOW(value: number, spec: string): boolean {
  // day-of-week: 0=Sun ... 6=Sat. Allow 7 as Sunday alias.
  const normalised = spec.replace(/7/g, "0");
  return matchesField(value, normalised);
}
