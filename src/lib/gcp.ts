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

let _firestore: Firestore | null = null;
let _pubsub: PubSub | null = null;
let _pubsubTopic: Topic | null = null;

function isTruthy(v: string | undefined): boolean {
  return v === "1" || v === "true" || v === "yes";
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
