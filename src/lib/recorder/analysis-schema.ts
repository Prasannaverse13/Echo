/**
 * Analysis schema — the structured output of the Describer agent.
 *
 * This is the contract between the LLM that reconstructs a recorded work session
 * and the rest of the pipeline (the user's review UI, the Builder agent that
 * turns the analysis into a runnable skill). The shape is lifted from the
 * Microsoft Skill Recorder analysis schema (see `common/analysis.ts` in that
 * repo) and adapted for our web app: we don't have window-level OS events, so
 * the `apps[]` field captures the *service / domain* the user was in (e.g.
 * "Google Sheets", "LinkedIn") rather than the executable name.
 *
 * Two pieces:
 *   - `AnalysisSubmission` — what the Describer agent submits via the
 *     `/api/skills/analyze` endpoint (one shot, no session id yet).
 *   - `Analysis` — the full persisted record (with revision + feedback log +
 *     approval flag). Built from a submission by the API route.
 *
 * No zod — we hand-roll minimal validators that return either a normalized
 * value or a list of `Issue`s. Cheap, dependency-free, and the schema is
 * small enough that the duplication with TypeScript types is acceptable.
 */

export type Confidence = "high" | "medium" | "low";

export interface AnalysisStep {
  /** Stable short id assigned by the agent, "s1", "s2", ... */
  id: string;
  /** Short past-tense label, e.g. "Searched Google for 'AI jobs'". */
  title: string;
  /** 1-3 sentences of what happened, past tense, verb-first. */
  detail: string;
  /** Step start in `atMs` (ms since recording started), when known. */
  startMs?: number;
  /** Step end in `atMs` (ms since recording started), when known. */
  endMs?: number;
  /** Apps / services involved, e.g. ["LinkedIn", "Google Sheets"]. */
  apps: string[];
  /** Free-text evidence refs the agent leaned on. */
  evidence: string[];
  /** Agent's own confidence in this step. */
  confidence: Confidence;
}

export interface AnalysisSubmission {
  /** Short 2-5 word label for lists/menus. NOT just a truncated intent. */
  title: string;
  /** One-sentence statement of the user's overall goal. */
  intent: string;
  intentConfidence: Confidence;
  /** 1-2 sentences of evidence for the intent, past tense, verb-first. */
  intentRationale: string;
  steps: AnalysisStep[];
}

export interface FeedbackEntry {
  /** Revision number this feedback produced. */
  revision: number;
  /** ISO timestamp of when the feedback was given. */
  at: string;
  /** Optional overall natural-language feedback. */
  overall?: string;
  /** Optional per-step natural-language notes. */
  steps: Array<{ stepId: string; note: string }>;
}

export interface Analysis {
  /** Schema version. Bump on breaking changes. */
  version: 1;
  /** Session id (the recording). */
  sessionId: string;
  /** 1-indexed revision. Bumped on every (re)analyze. */
  revision: number;
  createdAt: string;
  /** Title from the latest submission. */
  title: string;
  intent: string;
  intentConfidence: Confidence;
  intentRationale: string;
  steps: AnalysisStep[];
  /** Chronological log of feedback rounds applied so far. */
  feedbackLog: FeedbackEntry[];
  /** True when the user has explicitly approved this analysis. */
  approved: boolean;
  /** ISO timestamp of approval, when approved. */
  approvedAt?: string;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

export interface Issue {
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: Issue[] };

const CONFIDENCE_VALUES: Confidence[] = ["high", "medium", "low"];

function asString(v: unknown, path: string, issues: Issue[], max = 1000): string {
  if (typeof v !== "string") {
    issues.push({ path, message: "expected a string" });
    return "";
  }
  if (v.length > max) return v.slice(0, max);
  return v;
}

function asConfidence(v: unknown, path: string, issues: Issue[]): Confidence {
  if (typeof v === "string" && (CONFIDENCE_VALUES as string[]).includes(v)) {
    return v as Confidence;
  }
  issues.push({ path, message: `expected one of ${CONFIDENCE_VALUES.join(", ")}` });
  return "medium";
}

function asNumber(v: unknown, path: string, issues: Issue[]): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    issues.push({ path, message: "expected a finite number" });
    return undefined;
  }
  return v;
}

function asStringArray(v: unknown, path: string, issues: Issue[]): string[] {
  if (!Array.isArray(v)) {
    issues.push({ path, message: "expected an array" });
    return [];
  }
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.slice(0, 200));
}

function asStep(v: unknown, path: string, issues: Issue[]): AnalysisStep | null {
  if (!v || typeof v !== "object") {
    issues.push({ path, message: "expected an object" });
    return null;
  }
  const r = v as Record<string, unknown>;
  const id = asString(r.id, `${path}.id`, issues, 20);
  const title = asString(r.title, `${path}.title`, issues, 200);
  const detail = asString(r.detail, `${path}.detail`, issues, 1500);
  if (!id || !title) {
    issues.push({ path, message: "id and title are required" });
    return null;
  }
  return {
    id,
    title,
    detail,
    startMs: asNumber(r.startMs, `${path}.startMs`, issues),
    endMs: asNumber(r.endMs, `${path}.endMs`, issues),
    apps: asStringArray(r.apps, `${path}.apps`, issues),
    evidence: asStringArray(r.evidence, `${path}.evidence`, issues),
    confidence: asConfidence(r.confidence, `${path}.confidence`, issues),
  };
}

/**
 * Validate and normalize an `AnalysisSubmission`. Lenient on shape: missing
 * optional fields fall back to defaults, missing required fields produce
 * `issues[]`. Returns the normalized value when `ok: true`.
 */
export function parseAnalysisSubmission(raw: unknown): ValidationResult<AnalysisSubmission> {
  const issues: Issue[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, issues: [{ path: "(root)", message: "expected an object" }] };
  }
  const r = raw as Record<string, unknown>;
  const title = asString(r.title, "title", issues, 80);
  const intent = asString(r.intent, "intent", issues, 500);
  if (!title) issues.push({ path: "title", message: "title is required" });
  if (!intent) issues.push({ path: "intent", message: "intent is required" });

  const intentConfidence = asConfidence(
    r.intentConfidence,
    "intentConfidence",
    issues
  );
  const intentRationale = asString(r.intentRationale, "intentRationale", issues, 1500);

  const rawSteps = Array.isArray(r.steps) ? r.steps : [];
  if (rawSteps.length === 0) {
    issues.push({ path: "steps", message: "at least one step is required" });
  }
  const steps: AnalysisStep[] = [];
  rawSteps.forEach((s, i) => {
    const step = asStep(s, `steps[${i}]`, issues);
    if (step) steps.push(step);
  });

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      title: title.trim(),
      intent: intent.trim(),
      intentConfidence,
      intentRationale: intentRationale.trim(),
      steps,
    },
  };
}

/**
 * Build a full `Analysis` from an agent submission + engine-managed fields.
 * Use this in the `/api/skills/analyze` route to wrap what Gemini returned.
 */
export function toAnalysis(
  sessionId: string,
  revision: number,
  submission: AnalysisSubmission,
  feedbackLog: FeedbackEntry[]
): Analysis {
  return {
    version: 1,
    sessionId,
    revision,
    createdAt: new Date().toISOString(),
    title: submission.title,
    intent: submission.intent,
    intentConfidence: submission.intentConfidence,
    intentRationale: submission.intentRationale,
    steps: submission.steps,
    feedbackLog,
    approved: false,
  };
}
