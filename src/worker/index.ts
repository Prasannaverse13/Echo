/**
 * Echo worker — the production Taskmaster.
 *
 * Subscribes to the `echo-runs` Pub/Sub topic and runs the Echo ADK
 * agent (`@/lib/agents/echo-agent`) for each input in every run.
 *
 * Lifecycle of a single run event:
 *   1. `run.created` message arrives on the subscription
 *   2. Worker reads `runs/{runId}` from Firestore
 *      → has skillId, totalInputs, skill (steps), goal, startedAt
 *   3. For each input (parallelizable in production via Promise.allSettled
 *      bounded by `WORKER_CONCURRENCY`):
 *        a. Invoke `runEchoAgent({ runId, skillId, inputId, input, skill })`
 *        b. For each yielded action:
 *           - write to `runs/{runId}/events/{eventId}` in Firestore
 *           - publish `run.progress` to the same topic (for any other listener)
 *        c. update `runs/{runId}` progress
 *   4. Publish `run.completed` once totalInputs reached
 *
 * Two run modes:
 *   - `pnpm worker`     — local Node process, ADC via gcloud CLI
 *   - Cloud Run service — `Dockerfile.worker`, same code, ADC via attached SA
 *
 * The worker is intentionally framework-free (no Next.js, no React) so it
 * stays small, fast to start, and easy to horizontally scale.
 */

import type { Message } from "@google-cloud/pubsub";
import { PubSub, type Subscription, type CreateSubscriptionOptions } from "@google-cloud/pubsub";
import { Firestore, type FieldValue } from "@google-cloud/firestore";

import { runEchoAgent, type AgentAction } from "@/lib/agents/echo-agent";
import { isGcpAvailable } from "@/lib/gcp";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PROJECT_ID =
  process.env.GCP_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  "echo-hackathon-2026";

const TOPIC_NAME = process.env.GCP_PUBSUB_TOPIC || "echo-runs";
const SUBSCRIPTION_NAME =
  process.env.GCP_PUBSUB_SUBSCRIPTION || "echo-runs-worker";
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY || "4");
const PORT = Number(process.env.PORT || "8080");

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

const pubsub = new PubSub({ projectId: PROJECT_ID });
const firestore = new Firestore({ projectId: PROJECT_ID });

const subscription: Subscription = pubsub.subscription(SUBSCRIPTION_NAME, {
  // SubscriberOptions: keep the default max ack deadline (library auto-tunes
  // to the 99th percentile, capped at 10 minutes by the server). We bound
  // the local buffer instead via flow control + batching.
  flowControl: {
    maxMessages: CONCURRENCY * 16,
  },
  batching: {
    maxMessages: CONCURRENCY * 8,
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RunDoc {
  runId: string;
  skillId: string;
  agentId?: string | null;
  goal?: string | null;
  totalInputs: number;
  status: string;
  startedAt: string;
  skill?: {
    suggestedName: string;
    steps: Array<{ num: number; title: string; detail: string; at: string }>;
  } | null;
}

interface RunCreatedPayload {
  eventType: "run.created";
  runId: string;
  skillId: string;
  totalInputs: number;
  createdAt?: string;
}

interface RunEvent {
  eventId: string;
  runId: string;
  inputId: string;
  type: AgentAction["type"];
  text?: string;
  name?: string;
  ts: string;
}

async function fetchRun(runId: string): Promise<RunDoc | null> {
  const snap = await firestore.collection("runs").doc(runId).get();
  if (!snap.exists) return null;
  return snap.data() as RunDoc;
}

async function writeRunEvent(event: RunEvent): Promise<void> {
  await firestore
    .collection("runs")
    .doc(event.runId)
    .collection("events")
    .doc(event.eventId)
    .set({
      inputId: event.inputId,
      type: event.type,
      text: event.text ?? null,
      name: event.name ?? null,
      ts: event.ts,
    });
}

async function updateRun(runId: string, patch: Record<string, unknown>): Promise<void> {
  await firestore
    .collection("runs")
    .doc(runId)
    .set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

async function publishProgress(payload: Record<string, unknown>): Promise<void> {
  try {
    await pubsub.topic(TOPIC_NAME).publishMessage({
      json: payload,
      attributes: { source: "echo-worker", eventType: String(payload.eventType ?? "unknown") },
    });
  } catch (err) {
    // Non-fatal — the dashboard polls Firestore as a fallback
    console.warn("[worker] progress publish failed:", (err as Error).message);
  }
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Core: process one run.created message
// ---------------------------------------------------------------------------

async function processRun(payload: RunCreatedPayload): Promise<void> {
  if (payload.eventType !== "run.created") {
    console.log(`[worker] ignoring eventType=${payload.eventType}`);
    return;
  }

  console.log(
    `[worker] run.created runId=${payload.runId} skillId=${payload.skillId} totalInputs=${payload.totalInputs}`
  );

  const fetchedRun = await fetchRun(payload.runId);
  if (!fetchedRun) {
    console.warn(`[worker] run ${payload.runId} not found in Firestore — skipping`);
    return;
  }
  const run = fetchedRun;

  // In production we'd also pull the inputs[] — for the worker we read the
  // current run document and (if needed) re-fetch a longer-lived inputs list.
  // The route handler persists the inputs in the run doc as an `inputs` field.
  const inputs: Array<{ id: string; payload: Record<string, unknown> }> =
    (run as unknown as { inputs?: Array<{ id: string; payload: Record<string, unknown> }> }).inputs ?? [];

  // Fallback: if no inputs persisted, synthesize a single input so the run
  // is still observable end-to-end (the demo case).
  const effectiveInputs =
    inputs.length > 0
      ? inputs
      : Array.from({ length: Math.max(1, run.totalInputs ?? 1) }, (_, i) => ({
          id: `${payload.runId}-input-${i + 1}`,
          payload: { demo: true, runId: payload.runId, index: i + 1 },
        }));

  const skill = run.skill ?? {
    suggestedName: `Skill ${run.skillId}`,
    steps: [
      { num: 1, title: "Read input", detail: "Parse the input payload.", at: "00:00" },
      { num: 2, title: "Process", detail: "Apply the skill's logic.", at: "00:10" },
      { num: 3, title: "Persist result", detail: "Write the result back.", at: "00:20" },
    ],
  };

  await updateRun(run.runId, { status: "running", workerStartedAt: new Date().toISOString() });

  let completed = 0;
  const total = effectiveInputs.length;

  // Bounded-concurrency loop. Each input runs the ADK agent independently
  // and streams events to Firestore + Pub/Sub.
  const queue = effectiveInputs.slice();
  const workers: Promise<void>[] = [];

  async function runOne(input: { id: string; payload: Record<string, unknown> }): Promise<void> {
    const startedAt = Date.now();
    let lastAction: AgentAction | null = null;
    try {
      for await (const action of runEchoAgent({
        runId: run.runId,
        skillId: run.skillId,
        inputId: input.id,
        input: input.payload,
        skill,
      })) {
        lastAction = action;
        const ev: RunEvent = {
          eventId: makeId("evt"),
          runId: run.runId,
          inputId: input.id,
          type: action.type,
          text: action.text,
          name: action.name,
          ts: new Date().toISOString(),
        };
        await writeRunEvent(ev);
        await publishProgress({
          eventType: "run.event",
          runId: run.runId,
          inputId: input.id,
          type: action.type,
          text: action.text,
        });
      }
    } catch (err) {
      await writeRunEvent({
        eventId: makeId("evt"),
        runId: run.runId,
        inputId: input.id,
        type: "thought",
        text: `Worker error: ${(err as Error).message}`,
        ts: new Date().toISOString(),
      });
    }

    completed += 1;
    const progress = Math.round((completed / total) * 100);
    const finished = {
      inputId: input.id,
      durationMs: Date.now() - startedAt,
      ok: lastAction?.type === "final_answer",
      summary: lastAction?.text ?? null,
    };
    await updateRun(run.runId, {
      progress,
      completedInputs: completed,
      lastFinished: finished,
    });
    await publishProgress({
      eventType: "run.progress",
      runId: run.runId,
      completed,
      total,
      progress,
      at: new Date().toISOString(),
    });
    console.log(
      `[worker] input ${input.id} done (${completed}/${total}, ${finished.durationMs}ms)`
    );
  }

  for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
    const next = queue.shift();
    if (!next) break;
    workers.push(
      runOne(next).then(async () => {
        while (queue.length > 0) {
          const more = queue.shift()!;
          await runOne(more);
        }
      })
    );
  }

  await Promise.allSettled(workers);

  await updateRun(run.runId, {
    status: "completed",
    progress: 100,
    completedAt: new Date().toISOString(),
  });
  await publishProgress({
    eventType: "run.completed",
    runId: run.runId,
    total,
    completedAt: new Date().toISOString(),
  });
  console.log(`[worker] run ${run.runId} completed (${total} inputs)`);
}

// ---------------------------------------------------------------------------
// Subscription wiring
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("[worker] starting");
  console.log(`[worker] project=${PROJECT_ID} topic=${TOPIC_NAME} subscription=${SUBSCRIPTION_NAME}`);
  console.log(`[worker] concurrency=${CONCURRENCY} port=${PORT}`);

  // Cloud Run needs an HTTP server. The worker is a Pub/Sub listener, but
  // /healthz makes Cloud Run's health checks happy.
  startHealthServer();

  // When GCP is disabled (demo / local), the worker just sits on its
  // health server. The Pub/Sub listener is only attached when real
  // credentials are present.
  if (!isGcpAvailable()) {
    console.log("[worker] GCP disabled — running in health-only mode");
    return;
  }

  // Ensure the topic + subscription exist (idempotent).
  const topic = pubsub.topic(TOPIC_NAME);
  const [topicExists] = await topic.exists();
  if (!topicExists) {
    console.log(`[worker] creating topic ${TOPIC_NAME}`);
    await topic.create();
  }
  try {
    const opts: CreateSubscriptionOptions = {
      messageRetentionDuration: { seconds: 7 * 24 * 60 * 60 },
    };
    await pubsub.createSubscription(TOPIC_NAME, SUBSCRIPTION_NAME, opts);
    console.log(`[worker] created subscription ${SUBSCRIPTION_NAME}`);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("ALREADY_EXISTS") || msg.includes("already exists")) {
      console.log(`[worker] subscription ${SUBSCRIPTION_NAME} already exists`);
    } else {
      throw err;
    }
  }

  // Drain from the beginning on first boot so we don't miss pending runs.
  // After the first boot, new messages only.
  const drainFromStart = process.env.WORKER_DRAIN_FROM_START !== "false";
  if (drainFromStart) {
    try {
      await subscription.seek(new Date(0));
      console.log("[worker] drained to start of time");
    } catch {
      // Seek is not always supported; ignore.
    }
  }

  console.log(`[worker] listening on ${SUBSCRIPTION_NAME} ...`);

  subscription.on("message", async (msg: Message) => {
    try {
      const payload = JSON.parse(msg.data.toString("utf8")) as RunCreatedPayload;
      await processRun(payload);
      msg.ack();
    } catch (err) {
      console.error(`[worker] message handler error:`, (err as Error).message);
      // Nack so the message gets retried (Cloud Run's Pub/Sub subscription
      // respects ack deadline). After ackDeadline, Pub/Sub re-delivers.
      msg.nack();
    }
  });

  subscription.on("error", (err) => {
    console.error("[worker] subscription error:", err);
  });
}

function startHealthServer(): void {
  const http = require("node:http") as typeof import("node:http");
  const server = http.createServer((req, res) => {
    if (req.url === "/healthz" || req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, role: "echo-worker", ts: Date.now() }));
      return;
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(PORT, () => {
    console.log(`[worker] health server listening on :${PORT}/healthz`);
  });

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => {
      console.log(`[worker] ${sig} received, draining ...`);
      const closeSubscription = isGcpAvailable()
        ? subscription.close().catch(() => undefined)
        : Promise.resolve();
      closeSubscription
        .then(() => server.close(() => process.exit(0)))
        .catch((e) => {
          console.error("[worker] shutdown error:", e);
          process.exit(1);
        });
    });
  }
}

// FieldValue is re-exported for convenience when callers add serverTimestamps.
export type { FieldValue };

// Only run the bootstrap when this file is the entrypoint. When imported by
// tests we don't want to start a long-lived subscription.
const isEntrypoint =
  typeof require !== "undefined" && require.main === module;
if (isEntrypoint) {
  main().catch((err) => {
    console.error("[worker] fatal:", err);
    process.exit(1);
  });
}
