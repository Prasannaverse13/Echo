/**
 * Google Cloud Platform integration for Echo.
 *
 * Auth strategy
 * -------------
 * Echo uses **Application Default Credentials (ADC)** everywhere — no JSON
 * service-account keys required. ADC resolves credentials in this order:
 *
 *   1. `GOOGLE_APPLICATION_CREDENTIALS` env var (path to a JSON key file, or
 *      a `GOOGLE_APPLICATION_CREDENTIALS_JSON` string written to a temp file
 *      at boot — useful for Vercel/serverless).
 *   2. `gcloud auth application-default login` credentials (local dev).
 *   3. The runtime's attached service account (Cloud Run, GCE, GKE).
 *
 * This avoids the `iam.disableServiceAccountKeyCreation` org policy that the
 * yalixa.store workspace enforces, and matches the production-grade path
 * recommended by Google's Well-Architected Framework.
 *
 * Clients are lazy-initialized so the app still boots and the demo still
 * works even when no GCP credentials are available — every consumer must
 * wrap calls in `isGcpAvailable()` before invoking the real client.
 */

import { Firestore } from "@google-cloud/firestore";
import { PubSub, type Topic } from "@google-cloud/pubsub";

const PROJECT_ID =
  process.env.GCP_PROJECT_ID ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.NEXT_PUBLIC_GCP_PROJECT_ID ||
  "echo-hackathon-2026";

/**
 * Vercel has no metadata server and no `gcloud auth application-default
 * login` cache, so ADC always fails there. The org policy also blocks
 * creating JSON service-account keys. Skip GCP client init entirely on
 * Vercel so the @google-cloud/firestore auth probe never throws an
 * unhandled rejection (which would crash the serverless function with
 * exit code 128 even though our try/catch returns the response).
 */
const IS_VERCEL = Boolean(process.env.VERCEL);

let _firestore: Firestore | null = null;
let _pubsub: PubSub | null = null;
let _pubsubTopic: Topic | null = null;

function isTruthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
}

// One-time process-level safety net. The @google-cloud/* modules
// occasionally emit background auth-rejection promises that we can't
// directly await. Swallow the known "no ADC on Vercel" class of
// failure so it doesn't crash the Node process.
if (typeof process !== "undefined" && !(globalThis as { __echo_unhandled_swallow?: boolean }).__echo_unhandled_swallow) {
  (globalThis as { __echo_unhandled_swallow?: boolean }).__echo_unhandled_swallow = true;
  process.on("unhandledRejection", (reason) => {
    const msg = (() => {
      try {
        if (reason instanceof Error) return reason.message;
        return String(reason ?? "");
      } catch {
        return "";
      }
    })();
    if (
      msg.includes("Could not load the default credentials") ||
      msg.includes("All promises were rejected") ||
      msg.includes("MetadataLookupWarning") ||
      msg.includes("Unable to authenticate")
    ) {
      // Expected on Vercel — no ADC. Log once per process for diagnostics.
      console.warn("[gcp] swallowed background auth rejection (no ADC):", msg.slice(0, 120));
      return;
    }
    // For anything else, log loudly so it shows up in Vercel's runtime
    // logs. Don't crash — Vercel already penalises unhandledRejection,
    // but we want the diagnostic.
    console.error("[unhandledRejection]", reason);
  });
}

/**
 * Returns true when GCP integration is enabled and we have somewhere
 * sensible to write to. Reads `GCP_ENABLED` (default: true if a project
 * id is set, false otherwise).
 */
export function isGcpAvailable(): boolean {
  if (process.env.GCP_ENABLED === undefined) {
    // Default: enabled when a project id is configured AND not explicitly disabled.
    return Boolean(PROJECT_ID) && process.env.GCP_ENABLED !== "false";
  }
  return isTruthy(process.env.GCP_ENABLED);
}

export function getProjectId(): string {
  return PROJECT_ID;
}

function buildCredentialOptions(): { projectId: string } {
  return { projectId: PROJECT_ID };
}

/**
 * Firestore client. Collections used by Echo:
 *   - `skills`      — reconstructed skills (one doc per skill)
 *   - `agents`      — composed agent plans
 *   - `runs`        — execution runs, with nested `events` subcollection
 *   - `users`       — user-level state (future)
 */
export function getFirestore(): Firestore {
  if (!_firestore) {
    _firestore = new Firestore(buildCredentialOptions());
  }
  return _firestore;
}

/**
 * Pub/Sub topic for run-progress events. Topic name is configurable via
 * `GCP_PUBSUB_TOPIC` and defaults to `echo-runs`.
 */
export function getPubSubTopic(): Topic {
  if (!_pubsubTopic) {
    if (!_pubsub) {
      _pubsub = new PubSub(buildCredentialOptions());
    }
    const topicName = process.env.GCP_PUBSUB_TOPIC || "echo-runs";
    _pubsubTopic = _pubsub.topic(topicName);
  }
  return _pubsubTopic;
}

/**
 * Publish a JSON payload to the runs topic. Failures are logged but never
 * thrown — Echo's UI must keep working even if Pub/Sub is unavailable.
 */
export async function publishRunEvent(payload: Record<string, unknown>): Promise<string | null> {
  if (IS_VERCEL) return null;
  if (!isGcpAvailable()) return null;
  try {
    const topic = getPubSubTopic();
    const messageId = await topic.publishMessage({
      json: payload,
      attributes: {
        source: "echo-api",
        eventType: typeof payload.eventType === "string" ? payload.eventType : "unknown",
      },
    });
    return messageId;
  } catch (err) {
    console.warn("[gcp] pubsub publish failed (non-fatal):", (err as Error).message);
    return null;
  }
}

/**
 * Write a document to Firestore. Failures are logged but never thrown.
 */
export async function writeDoc(
  collection: string,
  id: string | undefined,
  data: Record<string, unknown>
): Promise<string | null> {
  // Short-circuit on Vercel — no ADC available, no point trying.
  if (IS_VERCEL) return null;
  if (!isGcpAvailable()) return null;
  try {
    const db = getFirestore();
    const ref = id ? db.collection(collection).doc(id) : db.collection(collection).doc();
    await ref.set(
      { ...data, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    return ref.id;
  } catch (err) {
    console.warn(`[gcp] firestore write to ${collection} failed (non-fatal):`, (err as Error).message);
    return null;
  }
}
