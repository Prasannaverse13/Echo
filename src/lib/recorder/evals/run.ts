/**
 * Recorder eval harness.
 *
 * Runs the Builder against each fixture's ground-truth Analysis, scores
 * the result, and prints a one-line summary. Used by `pnpm run eval:recorder`.
 *
 * Scoring (per fixture, max 100):
 *   - 30 pts: every expected `{{token}}` appears in at least one step text
 *   - 20 pts: no forbidden phrase appears in any step text or generalization
 *   - 20 pts: every expected tool id appears in the steps OR allowedTools
 *   - 10 pts: at least `minSteps` steps
 *   - 10 pts: plan has a generalization line
 *   - 10 pts: (if expectBrowser) at least one step has kind = "browser"
 *
 * Total score = sum across fixtures / number of fixtures.
 *
 * Usage:
 *   pnpm run eval:recorder                 # all fixtures
 *   pnpm run eval:recorder -- --only=1     # just the first fixture
 *
 * Requires: GEMINI_API_KEY in env (skips with a clear message otherwise).
 */

import { FIXTURES, type BuilderFixture } from "./fixtures";
import type { SkillPlan, PlanStep } from "../builder-schema";
import { builderFirstPassUserMessage, builderSystemPrompt } from "../prompts/builder";
import { catalogueForPrompt } from "../tool-catalogue";
import { parseSkillPlan, renderPlanBody } from "../builder-schema";
import { tokenIds } from "../tokens";
import { generateJson } from "@/lib/genai";

export interface FixtureScore {
  name: string;
  total: number;
  max: number;
  breakdown: Record<string, number>;
  notes: string[];
}

export interface EvalSummary {
  fixtures: FixtureScore[];
  average: number;
  ranAt: string;
  model: string;
}

const TOOL_IDS = new Set([
  "gmail_draft",
  "sheets_append",
  "sheets_read",
  "drive_upload",
  "slack_post",
  "hubspot_note",
  "notion_create",
  "echo_filter",
  "echo_format",
  "browser_run",
  "browser_extract",
]);

function isToolId(s: string): boolean {
  return TOOL_IDS.has(s);
}

/**
 * Run the Builder against one fixture. Returns the score and the produced
 * plan (for debugging).
 */
export async function scoreFixture(
  fixture: BuilderFixture,
  fetchImpl: typeof fetch = fetch
): Promise<{ score: FixtureScore; plan: SkillPlan | null; error?: string }> {
  const notes: string[] = [];
  const breakdown: Record<string, number> = {};

  // We can't actually call the API route from a CLI, but we can mirror its
  // behavior by calling the same Gemini call the route makes.
  // Note: the API route lives in /api/skills/build — for the CLI we call
  // the LLM directly via the same genai helper.
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      score: { name: fixture.name, total: 0, max: 100, breakdown, notes: ["GEMINI_API_KEY not set"] },
      plan: null,
      error: "GEMINI_API_KEY not set",
    };
  }

  const systemPrompt = builderSystemPrompt().replace(
    "## Tool catalogue",
    `## Tool catalogue (echo-skills)\n\n${catalogueForPrompt()}`
  );
  const userText = builderFirstPassUserMessage({ analysis: fixture.analysis });

  const result = await generateJson({
    model: "gemini-3.5-flash",
    prompt: systemPrompt + "\n\n" + userText,
    temperature: 0.3,
  });

  if (!result?.text) {
    return {
      score: { name: fixture.name, total: 0, max: 100, breakdown, notes: ["LLM returned no text"] },
      plan: null,
      error: "LLM returned no text",
    };
  }
  const parsed = parseSkillPlan(tryJson(result.text));
  if (!parsed.ok) {
    return {
      score: { name: fixture.name, total: 0, max: 100, breakdown, notes: ["Plan shape invalid: " + parsed.issues.map((i) => i.path).join(", ")] },
      plan: null,
      error: "Plan shape invalid",
    };
  }
  const plan = parsed.value;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _body = renderPlanBody(plan); // sanity check
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _fetch = fetchImpl;

  // 30 pts — expected tokens
  const allStepText = plan.steps.map((s) => s.text).join("\n");
  const allRefs = tokenIds(allStepText + "\n" + plan.description + "\n" + plan.generalization);
  const refSet = new Set(allRefs);
  const missingTokens = fixture.expectedTokens.filter((t) => !refSet.has(t));
  if (fixture.expectedTokens.length === 0) {
    breakdown.tokens = 30;
  } else {
    const hit = fixture.expectedTokens.length - missingTokens.length;
    breakdown.tokens = Math.round((hit / fixture.expectedTokens.length) * 30);
    if (missingTokens.length > 0) notes.push(`Missing tokens: ${missingTokens.map((t) => `{{${t}}}`).join(", ")}`);
  }

  // 20 pts — no forbidden phrases
  const haystack = (plan.generalization + "\n" + plan.description + "\n" + plan.summary + "\n" + allStepText).toLowerCase();
  const forbiddenHits = (fixture.forbiddenPhrases ?? []).filter((p) => haystack.includes(p.toLowerCase()));
  if ((fixture.forbiddenPhrases ?? []).length === 0) {
    breakdown.noForbidden = 20;
  } else {
    const total = fixture.forbiddenPhrases!.length;
    breakdown.noForbidden = Math.max(0, 20 - Math.round((forbiddenHits.length / total) * 20));
    if (forbiddenHits.length > 0) notes.push(`Forbidden phrases present: ${forbiddenHits.join(", ")}`);
  }

  // 20 pts — expected tools
  const allTools = new Set<string>([...plan.allowedTools, ...plan.steps.map((s) => s.tool).filter(Boolean)]);
  if (!fixture.expectedTools || fixture.expectedTools.length === 0) {
    breakdown.tools = 20;
  } else {
    const hits = fixture.expectedTools.filter((t) => allTools.has(t));
    breakdown.tools = Math.round((hits.length / fixture.expectedTools.length) * 20);
    if (hits.length < fixture.expectedTools.length) {
      notes.push(`Missing tools: ${fixture.expectedTools.filter((t) => !allTools.has(t)).join(", ")}`);
    }
  }

  // 10 pts — min steps
  const minSteps = fixture.minSteps ?? 1;
  breakdown.minSteps = plan.steps.length >= minSteps ? 10 : 0;
  if (plan.steps.length < minSteps) notes.push(`Only ${plan.steps.length} steps (need ≥ ${minSteps})`);

  // 10 pts — generalization line
  breakdown.generalization = plan.generalization && plan.generalization.length > 20 ? 10 : 0;
  if (breakdown.generalization === 0) notes.push("Missing generalization line");

  // 10 pts — expectBrowser
  if (fixture.expectBrowser) {
    const hasBrowser = plan.steps.some((s: PlanStep) => s.kind === "browser");
    breakdown.expectBrowser = hasBrowser ? 10 : 0;
    if (!hasBrowser) notes.push("Plan has no browser-kind step");
  } else {
    breakdown.expectBrowser = 10;
  }

  // Bonus check: every tool id in the plan must be a known catalogue entry
  // (catch hallucinations like "github_clone" that we don't support).
  const unknownTools = Array.from(allTools).filter((t) => t && !isToolId(t));
  if (unknownTools.length > 0) {
    notes.push(`Unknown tool ids: ${unknownTools.join(", ")}`);
  }

  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  return { score: { name: fixture.name, total, max: 100, breakdown, notes }, plan };
}

function tryJson(s: string): unknown {
  const t = s.trim();
  if (t.startsWith("```")) {
    return JSON.parse(t.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "").trim());
  }
  return JSON.parse(t);
}

export async function runAllEvals(opts: { only?: number } = {}): Promise<EvalSummary> {
  const fixtures = opts.only !== undefined ? [FIXTURES[opts.only]] : FIXTURES;
  const scores: FixtureScore[] = [];
  let plans: (SkillPlan | null)[] = [];
  for (const f of fixtures) {
    const { score, plan } = await scoreFixture(f);
    scores.push(score);
    plans.push(plan);
  }
  const average = scores.length === 0 ? 0 : Math.round(scores.reduce((a, b) => a + b.total, 0) / scores.length);
  // Touch plans for debugging visibility (no-op).
  void plans;
  return {
    fixtures: scores,
    average,
    ranAt: new Date().toISOString(),
    model: "gemini-3.5-flash",
  };
}
