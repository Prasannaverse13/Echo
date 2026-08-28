/**
 * Backfill old `SkillRecord` shape with the new analysis / built / values
 * fields. Called when loading a skill from localStorage that was saved
 * before the Recorder pipeline upgrade.
 *
 * Idempotent — if the record already has the new fields, it is returned
 * unchanged.
 *
 * No import from `src/lib/client/stores.ts` to avoid a circular import.
 * The types are duplicated here (loosely typed) so this module is
 * leaf-importable.
 */

import type { Analysis, AnalysisStep, Confidence } from "./analysis-schema";
import type { BuiltSkill, SkillPlan } from "./builder-schema";

/** Loose shape of a skill record — matches `SkillRecord` in stores.ts but
 *  kept inline to avoid a circular import. */
export interface SkillRecordLike {
  id: string;
  name: string;
  description: string;
  color?: "dusty-sky" | "wisteria" | "desert-clay" | "mist-mint";
  trigger?: string;
  steps: Array<{ num: number; title: string; detail: string; at: string }>;
  createdAt: string;
  source?: "recorder" | "composer" | "seed" | "manual";
  intent?: string;
  triggers?: string[];
  integrations?: string[];
  // New fields (may be missing on legacy records).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  analysis?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  built?: any;
}

/**
 * Coerce a legacy record into the V2 shape. If the record already has
 * `analysis`, returns it unchanged (idempotent). Otherwise derives an
 * analysis from the existing intent + steps so the new UI can render
 * without forcing a re-record.
 */
export function migrateSkillRecord<T extends SkillRecordLike>(raw: T): T & {
  analysis: Analysis;
  built?: BuiltSkill;
} {
  if (!raw || typeof raw !== "object") return raw as T & { analysis: Analysis };
  // Already migrated.
  if (raw.analysis && (raw.analysis as { version?: number }).version === 1) {
    return raw as T & { analysis: Analysis; built?: BuiltSkill };
  }
  if (typeof raw.id !== "string" || typeof raw.name !== "string") {
    return raw as T & { analysis: Analysis };
  }
  if (!Array.isArray(raw.steps)) {
    return raw as T & { analysis: Analysis };
  }

  const sessionId = `legacy_${raw.id}`;
  const analysis: Analysis = {
    version: 1,
    sessionId,
    revision: 1,
    createdAt: raw.createdAt || new Date().toISOString(),
    title: shortTitle(raw.name),
    intent: raw.intent || raw.description || "Recorded workflow",
    intentConfidence: "medium",
    intentRationale:
      "Backfilled from a legacy skill record. Confidence is medium because the original review metadata is no longer available.",
    steps: raw.steps.map((s, i) => legacyStepToAnalysisStep(s, i)),
    feedbackLog: [],
    approved: true, // Legacy skills are treated as pre-approved (user already saved them).
    approvedAt: raw.createdAt,
  };

  const built = backfillBuilt(raw, analysis);

  return { ...raw, analysis, built };
}

/**
 * Best-effort backfill of a BuiltSkill from a legacy record. The body is a
 * short operational spec derived from the steps; the user can re-build
 * later if they want the full tokenized plan.
 */
function backfillBuilt(r: SkillRecordLike, analysis: Analysis): BuiltSkill {
  const plan: SkillPlan = {
    name: slugify(r.name),
    title: r.name,
    description: r.description,
    summary: r.intent || r.description,
    generalization: "Backfilled from a legacy skill — original review metadata was not preserved.",
    values: [],
    steps: analysis.steps.map((s) => ({
      kind: "action" as const,
      title: s.title,
      text: s.detail || s.title,
      tool: "",
    })),
    allowedTools: [],
  };
  return {
    version: 1,
    sessionId: analysis.sessionId,
    name: plan.name,
    description: plan.description,
    allowedTools: plan.allowedTools,
    plan,
    body: renderLegacyBody(plan),
    createdAt: r.createdAt,
  };
}

function renderLegacyBody(plan: SkillPlan): string {
  const lines: string[] = [];
  lines.push("## When to use");
  lines.push("");
  lines.push(plan.description);
  lines.push("");
  lines.push("## Procedure");
  lines.push("");
  plan.steps.forEach((s, i) => {
    lines.push(`### ${i + 1}. ${s.title}`);
    lines.push("");
    lines.push(s.text);
    lines.push("");
  });
  return lines.join("\n").trim() + "\n";
}

function legacyStepToAnalysisStep(
  s: { num: number; title: string; detail: string; at: string },
  i: number
): AnalysisStep {
  const apps = inferApps(s.title + " " + s.detail);
  const confidence: Confidence = "medium";
  return {
    id: `s${i + 1}`,
    title: pastTense(s.title),
    detail: s.detail ? capitalize(s.detail) : pastTense(s.title) + ".",
    startMs: mmSsToMs(s.at),
    endMs: undefined,
    apps,
    evidence: s.at ? [`at ${s.at}`] : [],
    confidence,
  };
}

function shortTitle(name: string): string {
  return name.replace(/[.!?]+$/g, "").trim().slice(0, 40);
}

function pastTense(s: string): string {
  return s.trim();
}

function capitalize(s: string): string {
  const t = s.trim();
  if (!t) return t;
  return t[0].toUpperCase() + t.slice(1);
}

function inferApps(text: string): string[] {
  const lower = text.toLowerCase();
  const apps: string[] = [];
  if (/linkedin/.test(lower)) apps.push("LinkedIn");
  if (/gmail|email|inbox/.test(lower)) apps.push("Gmail");
  if (/sheet|spreadsheet|excel/.test(lower)) apps.push("Google Sheets");
  if (/slack/.test(lower)) apps.push("Slack");
  if (/hubspot|crm/.test(lower)) apps.push("HubSpot");
  if (/drive|folder/.test(lower)) apps.push("Google Drive");
  if (/notion/.test(lower)) apps.push("Notion");
  if (/github|gh /.test(lower)) apps.push("GitHub");
  if (/whatsapp/.test(lower)) apps.push("WhatsApp");
  return Array.from(new Set(apps));
}

function mmSsToMs(s: string): number | undefined {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return undefined;
  return (Number(m[1]) * 60 + Number(m[2])) * 1000;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "recorded-skill"
  );
}

