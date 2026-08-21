import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/agents/run
 *
 * Spawns (or queues) a sub-agent to run a skill against a set of inputs.
 * In production, this would:
 *   1. Write a job to Pub/Sub
 *   2. A Cloud Run worker picks it up
 *   3. Worker calls Google ADK agent with the skill definition
 *   4. Agent executes steps via Google Workspace APIs (or Playwright for UI steps)
 *   5. Progress + results stream back via Pub/Sub to the dashboard
 *
 * For the hackathon demo, we simulate the orchestration and return a run ID
 * that the dashboard can poll for progress.
 */

interface RunRequest {
  skillId: string;
  agentId?: string;
  inputs: Array<{ id: string; payload: unknown }>;
  goal?: string;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as RunRequest;

  if (!body.skillId || !Array.isArray(body.inputs) || body.inputs.length === 0) {
    return NextResponse.json(
      { error: "skillId and non-empty inputs[] are required" },
      { status: 400 }
    );
  }

  // Generate a run ID
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // In production: enqueue to Pub/Sub, kick off Cloud Run worker
  // For demo: return immediately with a run ID the dashboard can subscribe to

  return NextResponse.json({
    ok: true,
    runId,
    skillId: body.skillId,
    totalInputs: body.inputs.length,
    status: "queued",
    message: `Sub-agent queued. ${body.inputs.length} input(s) will be processed in parallel.`,
    // Estimated completion (heuristic for demo)
    estimatedDurationSec: Math.max(30, body.inputs.length * 8),
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("id");
  if (!runId) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  // In production: read from Firestore
  // For demo: return synthetic progress based on time since run was started
  const startedAt = parseInt(runId.split("_")[1] ?? "0", 10);
  const elapsed = (Date.now() - startedAt) / 1000;
  const total = 100;
  const progress = Math.min(total, Math.floor(elapsed * 4));

  return NextResponse.json({
    ok: true,
    runId,
    status: progress >= total ? "completed" : "running",
    progress,
    total,
    eta: progress >= total ? 0 : Math.max(0, (total - progress) / 4),
  });
}
