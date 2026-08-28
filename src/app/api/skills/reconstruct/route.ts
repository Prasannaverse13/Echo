import { NextRequest, NextResponse } from "next/server";
import { isGcpAvailable, writeDoc } from "@/lib/gcp";
import { generateJson, generateJsonWithImages } from "@/lib/genai";
import {
  parseAnalysisSubmission,
  toAnalysis,
  type Analysis,
  type AnalysisSubmission,
} from "@/lib/recorder/analysis-schema";
import { describerFirstPassUserMessage, describerSystemPrompt } from "@/lib/recorder/prompts/describer";
import { serializeTimelineForDescriber, type SessionBundle } from "@/lib/recorder/events";

// Vercel serverless function timeout. Default is 10s; Gemini video analysis
// can take 15-30s depending on length. Bump to 60s on Hobby (the max).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/skills/reconstruct
 *
 * Body: {
 *   sessionId: string,
 *   video?: string,        // data: URL or raw base64
 *   videoMimeType?: string,
 *   durationSec: number,
 *   frameCount?: number,
 *   frames?: string[],     // fallback if no video
 *   events?: SessionBundle,
 *   narration?: { text: string, segments?: Array<{ atMs: number; text: string }> }
 * }
 *
 * First-pass Describer call. Watches the video (or reads the frames + events
 * + narration) and returns the full `AnalysisSubmission` shape that
 * Microsoft's Skill Recorder's Describer produces:
 *
 *   { title, intent, intentConfidence, intentRationale, steps[] }
 *
 * The client wraps this into a full `Analysis` (with revision + approved flag
 * set to false) and stores it next to the legacy `description` / `intent` /
 * `steps` fields so existing UI keeps working.
 *
 * Returns: { ok, sessionId, analysis, analysisSubmission, source, ... }
 *
 * Falls back to the legacy mock only if both Gemini attempts fail AND there
 * are no frames / video to analyze. With real media, the user gets a real
 * 502 if Gemini can't be reached.
 */

const REQ_MODELS = ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"] as const;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    sessionId,
    frameCount = 0,
    durationSec = 0,
    frames,
    video,
    videoMimeType,
    events,
    narration,
  } = body as {
    sessionId?: string;
    frameCount?: number;
    durationSec?: number;
    frames?: string[];
    video?: string;
    videoMimeType?: string;
    events?: SessionBundle;
    narration?: { text: string; segments?: Array<{ atMs: number; text: string }> };
  };

  const sid = (sessionId && typeof sessionId === "string" ? sessionId : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`); // eslint-disable-line @typescript-eslint/no-unused-vars
  const hasVideo = typeof video === "string" && video.length > 0;
  const hasFrames = Array.isArray(frames) && frames.length > 0;
  const hasNarration = !!(narration && typeof narration.text === "string" && narration.text.trim().length > 0);
  const hasEvents = !!(events && Array.isArray(events.events) && events.events.length > 0);

  // Build the system prompt (and figure out which inputs to attach).
  const systemPrompt = describerSystemPrompt({ hasVideo, hasFrames, hasNarration, hasEvents });
  const userText = describerFirstPassUserMessage({
    durationSec,
    frameCount: hasFrames ? frames!.length : frameCount,
    hasNarration,
    narrationPreview: narration?.text,
  });
  const userTextWithTimeline =
    hasEvents
      ? userText + "\n\n## Event timeline\n\n" + serializeTimelineForDescriber(events!) + "\n"
      : userText;

  // ---- Video path (preferred) ----
  if (hasVideo) {
    const videoData = parseDataUrl(video!, videoMimeType);
    const result = await generateJsonWithImages({
      model: REQ_MODELS[0],
      prompt: systemPrompt + "\n\n" + userTextWithTimeline,
      temperature: 0.4,
      images: [{ mimeType: videoData.mimeType, data: videoData.data }],
    });
    if (result?.text) {
      const parsed = parseAnalysisSubmission(tryJson(result.text));
      if (parsed.ok) {
        const analysis: Analysis = toAnalysis(sid, 1, parsed.value, []);
        await persist(analysis);
        return NextResponse.json({
          ok: true,
          sessionId: sid,
          source: result.source,
          videoSeconds: durationSec,
          analysis,
          analysisSubmission: parsed.value,
        });
      }
      return NextResponse.json(
        {
          ok: false,
          error:
            "Gemini watched the video but returned a non-Describer-shaped response. Try re-recording, or fill the skill in by hand.",
          issues: parsed.issues,
        },
        { status: 502 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          "Gemini didn't return a response to the video. Check GEMINI_API_KEY, GCP credentials, and model availability.",
      },
      { status: 502 }
    );
  }

  // ---- Frame path (legacy / fallback) ----
  const realFrames = (Array.isArray(frames) ? frames : [])
    .filter((f): f is string => typeof f === "string" && f.length > 0)
    .map((f) => parseDataUrl(f, "image/jpeg"));

  if (realFrames.length > 0) {
    const result = await generateJsonWithImages({
      model: REQ_MODELS[0],
      prompt: systemPrompt + "\n\n" + userTextWithTimeline,
      temperature: 0.4,
      images: realFrames,
    });
    if (result?.text) {
      const parsed = parseAnalysisSubmission(tryJson(result.text));
      if (parsed.ok) {
        const analysis: Analysis = toAnalysis(sid, 1, parsed.value, []);
        await persist(analysis);
        return NextResponse.json({
          ok: true,
          sessionId: sid,
          source: result.source,
          frameCount: realFrames.length,
          analysis,
          analysisSubmission: parsed.value,
        });
      }
      return NextResponse.json(
        {
          ok: false,
          error:
            "Gemini returned a non-Describer-shaped response. The model saw your frames but couldn't extract a structured analysis. Try re-recording with a clearer screen, or fill the skill in by hand.",
          issues: parsed.issues,
        },
        { status: 502 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          "Gemini didn't return a response. Check GEMINI_API_KEY, GCP credentials, and the model's availability. The frames were not analyzed.",
      },
      { status: 502 }
    );
  }

  // ---- Text-only fallback (no video, no frames, optional events + narration) ----
  if (hasEvents || hasNarration) {
    const result = await generateJson({
      model: REQ_MODELS[0],
      prompt: systemPrompt + "\n\n" + userTextWithTimeline,
      temperature: 0.4,
    });
    if (result?.text) {
      const parsed = parseAnalysisSubmission(tryJson(result.text));
      if (parsed.ok) {
        const analysis: Analysis = toAnalysis(sid, 1, parsed.value, []);
        await persist(analysis);
        return NextResponse.json({
          ok: true,
          sessionId: sid,
          source: result.source,
          analysis,
          analysisSubmission: parsed.value,
        });
      }
    }
  }

  // ---- Last-resort mock (no real media at all). Keeps the demo flow alive
  //      for clients that haven't supplied anything. ----
  const mock: AnalysisSubmission = {
    title: "Recorded workflow",
    intent: "User recorded a workflow (no media attached — using a placeholder analysis).",
    intentConfidence: "low",
    intentRationale: "No video, frames, events, or narration were attached. This is a placeholder so the review UI can render; the user should re-record or fill the skill in by hand.",
    steps: [
      {
        id: "s1",
        title: "Open the source app or page",
        detail: "Open the application or page required for the task.",
        apps: [],
        evidence: [],
        confidence: "low",
      },
    ],
  };
  const analysis: Analysis = toAnalysis(sid, 1, mock, []);
  await persist(analysis);

  return NextResponse.json({
    ok: true,
    sessionId: sid,
    source: "mock",
    gcp: isGcpAvailable() ? "connected" : "disabled",
    analysis,
    analysisSubmission: mock,
  });
}

// ---- helpers ----

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

async function persist(analysis: Analysis): Promise<void> {
  // Best-effort Firestore persist. Failures never block the response.
  if (isGcpAvailable()) {
    writeDoc(
      "skill_analyses",
      undefined,
      analysis as unknown as Record<string, unknown>
    ).catch(() => undefined);
  }
}
