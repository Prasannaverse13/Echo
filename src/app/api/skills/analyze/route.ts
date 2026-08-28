import { NextRequest, NextResponse } from "next/server";
import { generateJson, generateJsonWithImages } from "@/lib/genai";
import {
  parseAnalysisSubmission,
  toAnalysis,
  type Analysis,
  type AnalysisStep,
  type FeedbackEntry,
} from "@/lib/recorder/analysis-schema";
import {
  describerFeedbackUserMessage,
  describerSystemPrompt,
} from "@/lib/recorder/prompts/describer";
import { isGcpAvailable, writeDoc } from "@/lib/gcp";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/skills/analyze
 *
 * Re-run the Describer with user feedback. The user can give:
 *   - overall natural-language feedback ("the intent is wrong — it's about X, not Y")
 *   - per-step natural-language feedback ("step s3 is irrelevant", "you missed
 *     the step where I clicked Save")
 *
 * Body: {
 *   sessionId: string,
 *   previousAnalysis: Analysis,
 *   feedback: { overall?: string, steps: Array<{ stepId, note }> },
 *   // Optional context re-sent so the agent can re-watch the same media:
 *   video?: string,
 *   videoMimeType?: string,
 *   frames?: string[],
 *   events?: SessionBundle,
 *   narration?: { text: string }
 * }
 *
 * Returns: { ok, sessionId, analysis, analysisSubmission, source }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    sessionId,
    previousAnalysis,
    feedback,
    video,
    videoMimeType,
    frames,
    events,
    narration,
  } = body as {
    sessionId?: string;
    previousAnalysis?: Analysis;
    feedback?: { overall?: string; steps?: Array<{ stepId: string; note: string }> };
    video?: string;
    videoMimeType?: string;
    frames?: string[];
    events?: unknown;
    narration?: { text: string };
  };

  if (!previousAnalysis || typeof previousAnalysis !== "object") {
    return NextResponse.json(
      { ok: false, error: "previousAnalysis is required" },
      { status: 400 }
    );
  }
  if (!feedback || (typeof feedback.overall !== "string" && !(Array.isArray(feedback.steps) && feedback.steps.length > 0))) {
    return NextResponse.json(
      { ok: false, error: "feedback must include an overall note or at least one per-step note" },
      { status: 400 }
    );
  }

  const sid = sessionId || previousAnalysis.sessionId || `sess_${Date.now()}`;
  const newFeedback: FeedbackEntry = {
    revision: previousAnalysis.revision + 1,
    at: new Date().toISOString(),
    overall: feedback.overall?.trim() || undefined,
    steps: Array.isArray(feedback.steps)
      ? feedback.steps
          .filter((s) => s && typeof s.stepId === "string" && typeof s.note === "string")
          .map((s) => ({ stepId: s.stepId, note: s.note }))
      : [],
  };
  const newFeedbackLog = [...(previousAnalysis.feedbackLog ?? []), newFeedback];

  const hasVideo = typeof video === "string" && video.length > 0;
  const hasFrames = Array.isArray(frames) && frames.length > 0;
  const hasNarration = !!(narration && typeof narration.text === "string" && narration.text.trim().length > 0);

  const systemPrompt = describerSystemPrompt({ hasVideo, hasFrames, hasNarration, hasEvents: !!events });
  const userText = describerFeedbackUserMessage({
    previousAnalysis,
    feedback: newFeedbackLog,
  });

  const callJson = async (withMedia: boolean): Promise<string | null> => {
    const common = {
      model: "gemini-3.5-flash",
      prompt: systemPrompt + "\n\n" + userText,
      temperature: 0.3,
    } as const;
    if (withMedia && hasVideo) {
      const videoData = parseDataUrl(video!, videoMimeType);
      const r = await generateJsonWithImages({ ...common, images: [videoData] });
      return r?.text ?? null;
    }
    if (withMedia && hasFrames) {
      const realFrames = (frames as string[])
        .filter((f) => typeof f === "string" && f.length > 0)
        .map((f) => parseDataUrl(f, "image/jpeg"));
      const r = await generateJsonWithImages({ ...common, images: realFrames });
      return r?.text ?? null;
    }
    const r = await generateJson({ ...common });
    return r?.text ?? null;
  };

  let text: string | null = null;
  let source: string | null = null;
  if (hasVideo || hasFrames) {
    const t = await callJson(true);
    if (t) {
      text = t;
      source = "aistudio";
    }
  } else {
    const t = await callJson(false);
    if (t) {
      text = t;
      source = "aistudio";
    }
  }

  if (!text) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Gemini didn't return a response. Check GEMINI_API_KEY and model availability, then try again.",
      },
      { status: 502 }
    );
  }

  const parsed = parseAnalysisSubmission(tryJson(text));
  if (!parsed.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Gemini returned a non-Describer-shaped response.",
        issues: parsed.issues,
      },
      { status: 502 }
    );
  }

  // Preserve step ids from the previous analysis that the LLM kept at the
  // same id, so the UI's local edits don't get clobbered. If the LLM
  // removed a step we don't carry it forward.
  const previousById = new Map<string, AnalysisStep>();
  for (const s of previousAnalysis.steps ?? []) previousById.set(s.id, s);
  const mergedSteps: AnalysisStep[] = parsed.value.steps.map((s) => {
    const prev = previousById.get(s.id);
    if (!prev) return s;
    return { ...s, id: prev.id };
  });

  const submission = { ...parsed.value, steps: mergedSteps };
  const analysis: Analysis = toAnalysis(sid, newFeedback.revision, submission, newFeedbackLog);
  // The new analysis is NOT yet approved — the user must explicitly approve.
  await persist(sid, analysis);

  return NextResponse.json({
    ok: true,
    sessionId: sid,
    source,
    analysis,
    analysisSubmission: submission,
  });
}

function parseDataUrl(s: string, fallbackMime: string | undefined): { mimeType: string; data: string } {
  const safeFallback = fallbackMime ?? "application/octet-stream";
  if (s.startsWith("data:")) {
    const b64Idx = s.indexOf(";base64,");
    if (b64Idx > 5) {
      const rawMime = s.slice(5, b64Idx);
      const baseType = rawMime.split(";")[0].trim().toLowerCase();
      return { mimeType: baseType || safeFallback, data: s.slice(b64Idx + ";base64,".length) };
    }
    const commaIdx = s.indexOf(",");
    if (commaIdx > 0) {
      const rawMime = s.slice(5, commaIdx);
      const baseType = rawMime.split(";")[0].trim().toLowerCase();
      return { mimeType: baseType || safeFallback, data: s.slice(commaIdx + 1) };
    }
  }
  return { mimeType: safeFallback, data: s };
}

function tryJson(s: string): unknown {
  const t = s.trim();
  if (t.startsWith("```")) {
    return JSON.parse(t.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "").trim());
  }
  return JSON.parse(t);
}

async function persist(sessionId: string, analysis: Analysis): Promise<void> {
  if (isGcpAvailable()) {
    writeDoc("skill_analyses", sessionId, analysis as unknown as Record<string, unknown>).catch(
      () => undefined
    );
  }
}
