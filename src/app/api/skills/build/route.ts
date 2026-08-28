import { NextRequest, NextResponse } from "next/server";
import { generateJson } from "@/lib/genai";
import {
  buildFromPlan,
  parseSkillPlan,
  type BuiltSkill,
} from "@/lib/recorder/builder-schema";
import { builderFirstPassUserMessage, builderRevisionUserMessage, builderSystemPrompt } from "@/lib/recorder/prompts/builder";
import type { Analysis } from "@/lib/recorder/analysis-schema";
import { isGcpAvailable, writeDoc } from "@/lib/gcp";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/skills/build
 *
 * Two modes:
 *   - First-pass (no `previousPlan`): turns the approved analysis into a
 *     SkillPlan.
 *   - Revision (with `previousPlan` + `feedback`): re-runs the Builder
 *     with the previous plan in context and the user's natural-language
 *     feedback applied.
 *
 * Body (first-pass): { analysis: Analysis }
 * Body (revision):   { analysis: Analysis, previousPlan: SkillPlan, feedback: string }
 *
 * Returns: { ok, plan, built, source }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { analysis, previousPlan, feedback } = body as {
    analysis?: Analysis;
    previousPlan?: import("@/lib/recorder/builder-schema").SkillPlan;
    feedback?: string;
  };

  if (!analysis || typeof analysis !== "object") {
    return NextResponse.json(
      { ok: false, error: "analysis is required" },
      { status: 400 }
    );
  }
  if (previousPlan && (!feedback || typeof feedback !== "string" || !feedback.trim())) {
    return NextResponse.json(
      { ok: false, error: "feedback is required for a revision" },
      { status: 400 }
    );
  }

  const systemPrompt = builderSystemPrompt();
  const userText = previousPlan
    ? builderRevisionUserMessage({ analysis, previousPlan, feedback: feedback! })
    : builderFirstPassUserMessage({ analysis });

  const result = await generateJson({
    model: "gemini-3.5-flash",
    prompt: systemPrompt + "\n\n" + userText,
    temperature: 0.3,
  });

  if (!result?.text) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Gemini didn't return a response. Check GEMINI_API_KEY and model availability, then try again.",
      },
      { status: 502 }
    );
  }

  const parsed = parseSkillPlan(tryJson(result.text));
  if (!parsed.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Gemini returned a non-plan-shaped response.",
        issues: parsed.issues,
      },
      { status: 502 }
    );
  }

  // Revision-mode: preserve value / step ids from the previous plan that
  // the LLM kept. If the LLM dropped a step we don't carry it forward.
  let plan = parsed.value;
  if (previousPlan) {
    const prevValueIds = new Set(previousPlan.values.map((v) => v.id));
    const prevStepIds = new Set(previousPlan.steps.map((s) => `${s.kind}:${s.title}`));
    plan = {
      ...plan,
      values: plan.values.map((v) => (prevValueIds.has(v.id) ? v : { ...v, id: v.id })),
      steps: plan.steps.map((s, i) => {
        const key = `${s.kind}:${s.title}`;
        return prevStepIds.has(key) && previousPlan.steps[i] ? { ...s } : s;
      }),
    };
  }

  const built: BuiltSkill = buildFromPlan(analysis.sessionId, plan, analysis);
  await persist(analysis.sessionId, plan, built);

  return NextResponse.json({
    ok: true,
    source: result.source,
    plan,
    built,
  });
}

function tryJson(s: string): unknown {
  const t = s.trim();
  if (t.startsWith("```")) {
    return JSON.parse(t.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "").trim());
  }
  return JSON.parse(t);
}

async function persist(
  sessionId: string,
  plan: import("@/lib/recorder/builder-schema").SkillPlan,
  built: BuiltSkill
): Promise<void> {
  if (isGcpAvailable()) {
    writeDoc(
      "skill_plans",
      sessionId,
      { plan, built } as unknown as Record<string, unknown>
    ).catch(() => undefined);
  }
}
