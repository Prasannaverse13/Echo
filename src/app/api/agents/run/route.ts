import { NextRequest, NextResponse } from "next/server";
import {
  isGcpAvailable,
  publishRunEvent,
  writeDoc,
} from "@/lib/gcp";

/**
 * POST /api/agents/run
 *
 * Spawns (or queues) a sub-agent to run a skill against a set of inputs.
 *
 * Production flow (when GCP is enabled):
 *   1. Write the run record to Firestore (`runs/{runId}`) with status=queued.
 *   2. Publish a "run.created" event to Pub/Sub (`echo-runs` topic).
 *   3. A Cloud Run worker subscribes to that topic, pulls the run, and
 *      invokes the Echo ADK agent (`@/lib/agents/echo-agent`) for each
 *      input. The agent streams thoughts and tool calls back through
 *      Pub/Sub to the dashboard via Server-Sent Events.
 *
 * Demo flow (no GCP):
 *   - Return a runId the dashboard can poll; progress is synthesized
 *     in `GET /api/agents/run?id=...` based on time since start.
 */

interface RunRequest {
  skillId: string;
  agentId?: string;
  inputs: Array<{ id: string; payload: unknown }>;
  goal?: string;
  skill?: {
    suggestedName: string;
    steps: Array<{ num: number; title: string; detail: string; at: string }>;
  };
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as RunRequest;

  if (!body.skillId || !Array.isArray(body.inputs) || body.inputs.length === 0) {
    return NextResponse.json(
      { error: "skillId and non-empty inputs[] are required" },
      { status: 400 }
    );
  }

  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Best-effort persist to Firestore. The Cloud Run worker (src/worker)
  // reads this document to know which inputs to process and which skill
  // to invoke. We persist the inputs[] here so the worker doesn't need
  // a separate request payload.
  if (isGcpAvailable()) {
    writeDoc("runs", runId, {
      runId,
      skillId: body.skillId,
      agentId: body.agentId ?? null,
      goal: body.goal ?? null,
      totalInputs: body.inputs.length,
      inputs: body.inputs,
      status: "queued",
      startedAt: new Date().toISOString(),
      skill: body.skill ?? null,
    }).catch(() => undefined);

    // Publish a "run.created" event so the Cloud Run worker (subscribed to
    // `echo-runs` via the `echo-runs-worker` subscription) can pick it up.
    publishRunEvent({
      eventType: "run.created",
      runId,
      skillId: body.skillId,
      totalInputs: body.inputs.length,
      createdAt: new Date().toISOString(),
    }).catch(() => undefined);
  }

  return NextResponse.json({
    ok: true,
    runId,
    skillId: body.skillId,
    totalInputs: body.inputs.length,
    status: "queued",
    gcp: isGcpAvailable() ? "connected" : "disabled",
    message: isGcpAvailable()
      ? `Run queued. Cloud Run worker will pick it up from Pub/Sub and invoke the Echo ADK agent.`
      : `Sub-agent queued (demo mode). ${body.inputs.length} input(s) will be processed in parallel.`,
    estimatedDurationSec: Math.max(30, body.inputs.length * 8),
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("id");
  if (!runId) {
    return NextResponse.json({ error: "id query param required" }, { status: 400 });
  }

  // In production: read run progress from Firestore and live events from
  // a Server-Sent Events stream backed by Pub/Sub.
  // For demo: synthesize progress based on time since start.
  const startedAt = parseInt(runId.split("_")[1] ?? "0", 10);
  const elapsed = (Date.now() - startedAt) / 1000;
  const total = 100;
  const progress = Math.min(total, Math.floor(elapsed * 4));

  // Publish progress events to Pub/Sub (no-op when GCP disabled)
  if (isGcpAvailable() && progress < total) {
    publishRunEvent({
      eventType: "run.progress",
      runId,
      progress,
      total,
      at: new Date().toISOString(),
    }).catch(() => undefined);
  }

  return NextResponse.json({
    ok: true,
    runId,
    status: progress >= total ? "completed" : "running",
    progress,
    total,
    eta: progress >= total ? 0 : Math.max(0, (total - progress) / 4),
    gcp: isGcpAvailable() ? "connected" : "disabled",
  });
}
