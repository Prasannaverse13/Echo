/**
 * Builder schema — the structured output of the Builder agent.
 *
 * Two artifacts:
 *   1. `SkillPlan` — what the agent proposes after reading the approved
 *      analysis. User reviews and refines this in natural language; each
 *      refinement re-runs the Builder with the previous plan in context.
 *   2. `BuiltSkill` — the final, render-ready artifact. Produced only when
 *      the user approves the plan. Renders to the SKILL.md body and the
 *      `allowed-tools` frontmatter.
 *
 * Key differences from the Microsoft Skill Recorder's builder schema:
 *   - `kind` is `"calculation" | "action" | "browser"` — we add a third
 *     "browser" kind for steps that genuinely need UI replay (e.g. LinkedIn
 *     search). MS prefers native tools; we use this kind as the escape hatch.
 *   - `tool` is a free string that the user picks from `tool-catalogue.ts`,
 *     not a structured object. The UI shows a dropdown.
 *   - `values[]` is the fixed-literal set the plan references as `{{id}}`
 *     tokens. The UI renders each as an editable pill; the body is re-rendered
 *     deterministically with `renderValues()` whenever a value changes.
 *
 * The plan's `body` is the **template** — it contains `{{value_id}}`
 * placeholders. The build's `body` is the same text. Only at render time
 * (in `generateSkillFromBuilt`) do we substitute the literals.
 */

import type { Analysis } from "./analysis-schema";

// ---------------------------------------------------------------------------
// Value tokens
// ---------------------------------------------------------------------------

/**
 * A named fixed literal (a URL, path, repo slug, constant) that plan steps
 * reference by `{{id}}` token. The UI shows each as an editable pill.
 */
export interface SkillValue {
  /** Token key, normalized to `[a-z0-9_]+`, ≤40 chars. */
  id: string;
  /** Human label shown on the pill, e.g. "Blog Backlog v2 URL". */
  name: string;
  /** The exact literal that substitutes in for the token. */
  value: string;
}

/** Normalize arbitrary text into a safe value id (`[a-z0-9_]+`, ≤40 chars). */
export function slugifyValueId(raw: string): string {
  const id = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/g, "");
  return id || "value";
}

/** Coerce to kebab-case for the skill name. */
export function slugifySkillName(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug || "recorded-skill";
}

// ---------------------------------------------------------------------------
// Plan + built
// ---------------------------------------------------------------------------

/** Step side-effect classification. */
export type PlanStepKind = "calculation" | "action" | "browser";

export interface PlanStep {
  kind: PlanStepKind;
  /** Short title/label, e.g. "List open PRs". */
  title: string;
  /**
   * Imperative, generalized description of the step. May contain `{{id}}`
   * tokens that reference `SkillValue.id` in the plan's `values[]`.
   */
  text: string;
  /** The Echo tool id this step uses (from `tool-catalogue.ts`). */
  tool: string;
}

/**
 * The Builder's proposed plan. Shown to the user before any skill is written.
 * User refines in NL; each refinement re-runs the Builder.
 */
export interface SkillPlan {
  /** kebab-case skill id, e.g. "submit-expense-records". */
  name: string;
  /** Human-friendly title, e.g. "Submit expense records". */
  title: string;
  /** Trigger-oriented description (becomes the SKILL.md `description`). */
  description: string;
  /** Plain-language summary of what the skill does. */
  summary: string;
  /**
   * How the recorded specifics are generalized — the loop/collection
   * insight. e.g. "Iterates over every row in the expense CSV; the 3 rows in
   * the recording are illustrative."
   */
  generalization: string;
  /** Named fixed literals the steps reference by `{{id}}`. */
  values: SkillValue[];
  /** The generalized procedure as ordered, typed steps. */
  steps: PlanStep[];
  /** Proposed `allowed-tools` frontmatter patterns, e.g. "browser_run". */
  allowedTools: string[];
}

/**
 * The final, render-ready skill. Produced only when the user approves the
 * plan. Renders to the SKILL.md frontmatter + body via `renderBuiltSkill()`.
 */
export interface BuiltSkill {
  /** Schema version. */
  version: 1;
  /** Session id this was built from. */
  sessionId: string;
  /** kebab-case skill id. */
  name: string;
  /** SKILL.md `description` (trigger keywords). */
  description: string;
  /** `allowed-tools` frontmatter entries. */
  allowedTools: string[];
  /** The plan that produced this skill (for re-export / UI). */
  plan: SkillPlan;
  /** SKILL.md body (instructions). Contains `{{id}}` tokens. */
  body: string;
  /** ISO timestamp of when this was built. */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

const STEP_KINDS: PlanStepKind[] = ["calculation", "action", "browser"];

interface Issue { path: string; message: string }

function asString(v: unknown, path: string, issues: Issue[], max = 1000, required = false): string {
  if (typeof v !== "string") {
    if (required) issues.push({ path, message: "expected a non-empty string" });
    return "";
  }
  return v.length > max ? v.slice(0, max) : v;
}

function asKind(v: unknown, path: string, issues: Issue[]): PlanStepKind {
  if (typeof v === "string" && (STEP_KINDS as string[]).includes(v)) {
    return v as PlanStepKind;
  }
  issues.push({ path, message: `expected one of ${STEP_KINDS.join(", ")}` });
  return "action";
}

/**
 * Validate and normalize a `SkillPlan` returned by the Builder. Lenient: bad
 * optional fields fall back to defaults; bad required fields are reported in
 * `issues[]`. The plan's `values[]` are slugified and de-duplicated by id.
 */
export function parseSkillPlan(raw: unknown): { ok: true; value: SkillPlan } | { ok: false; issues: Issue[] } {
  const issues: Issue[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, issues: [{ path: "(root)", message: "expected an object" }] };
  }
  const r = raw as Record<string, unknown>;
  const name = slugifySkillName(asString(r.name, "name", issues, 80, true));
  const title = asString(r.title, "title", issues, 120, true);
  const description = asString(r.description, "description", issues, 500, true);
  if (!title) issues.push({ path: "title", message: "title is required" });
  if (!description) issues.push({ path: "description", message: "description is required" });

  const summary = asString(r.summary, "summary", issues, 500);
  const generalization = asString(r.generalization, "generalization", issues, 1000);

  // Values: normalize ids, dedupe (last write wins), drop empties.
  const rawValues = Array.isArray(r.values) ? r.values : [];
  const valueMap = new Map<string, SkillValue>();
  rawValues.forEach((v, i) => {
    if (!v || typeof v !== "object") {
      issues.push({ path: `values[${i}]`, message: "expected an object" });
      return;
    }
    const o = v as Record<string, unknown>;
    const id = slugifyValueId(String(o.id ?? o.name ?? `value_${i}`));
    const name = asString(o.name, `values[${i}].name`, issues, 80) || id;
    const value = asString(o.value, `values[${i}].value`, issues, 2000);
    if (valueMap.has(id)) {
      // Merge: keep the latest name/value, prefer non-empty.
      const prev = valueMap.get(id)!;
      valueMap.set(id, {
        id,
        name: name || prev.name,
        value: value || prev.value,
      });
    } else {
      valueMap.set(id, { id, name, value });
    }
  });
  const values = Array.from(valueMap.values());

  // Steps.
  const rawSteps = Array.isArray(r.steps) ? r.steps : [];
  if (rawSteps.length === 0) {
    issues.push({ path: "steps", message: "at least one step is required" });
  }
  const steps: PlanStep[] = [];
  rawSteps.forEach((s, i) => {
    if (!s || typeof s !== "object") {
      issues.push({ path: `steps[${i}]`, message: "expected an object" });
      return;
    }
    const o = s as Record<string, unknown>;
    const text = asString(o.text, `steps[${i}].text`, issues, 2000, true);
    if (!text) return;
    steps.push({
      kind: asKind(o.kind, `steps[${i}].kind`, issues),
      title: asString(o.title, `steps[${i}].title`, issues, 120),
      text,
      tool: asString(o.tool, `steps[${i}].tool`, issues, 80),
    });
  });

  const allowedTools = Array.isArray(r.allowedTools)
    ? r.allowedTools.filter((x): x is string => typeof x === "string").slice(0, 20)
    : [];

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: { name, title, description, summary, generalization, values, steps, allowedTools },
  };
}

/**
 * Build a `BuiltSkill` from an approved plan + analysis context. The body is
 * rendered from the plan's `steps[]` as a `### N. Title` block per step.
 */
export function buildFromPlan(
  sessionId: string,
  plan: SkillPlan,
  _analysis: Analysis | null
): BuiltSkill {
  const body = renderPlanBody(plan);
  return {
    version: 1,
    sessionId,
    name: plan.name,
    description: plan.description,
    allowedTools: plan.allowedTools,
    plan,
    body,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Render the SKILL.md body from a `SkillPlan`. The body is a sequence of
 * `### N. <title>` blocks, each with the step's `text`. The full text is the
 * When-to-use header + a short body that interleaves the plan's `generalization`
 * note + the steps. `{{id}}` tokens are left as-is — substitute at render time.
 */
export function renderPlanBody(plan: SkillPlan): string {
  const lines: string[] = [];
  lines.push("## When to use");
  lines.push("");
  lines.push(plan.description.trim());
  lines.push("");
  if (plan.generalization) {
    lines.push("## Generalization");
    lines.push("");
    lines.push(plan.generalization.trim());
    lines.push("");
  }
  if (plan.values.length > 0) {
    lines.push("## Fixed values");
    lines.push("");
    for (const v of plan.values) {
      lines.push(`- \`{{${v.id}}}\` — ${v.name}: ${v.value}`);
    }
    lines.push("");
  }
  lines.push("## Procedure");
  lines.push("");
  plan.steps.forEach((s, i) => {
    const verb = s.kind === "calculation" ? "Compute" : s.kind === "browser" ? "In the browser," : "Then";
    lines.push(`### ${i + 1}. ${s.title || `Step ${i + 1}`}`);
    lines.push("");
    if (s.tool) lines.push(`_Tool: \`${s.tool}\` · Kind: \`${s.kind}\`_`);
    else lines.push(`_Kind: \`${s.kind}\`_`);
    lines.push("");
    lines.push(`${verb} ${s.text.trim()}`);
    lines.push("");
  });
  if (plan.summary) {
    lines.push("## Summary");
    lines.push("");
    lines.push(plan.summary.trim());
    lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
