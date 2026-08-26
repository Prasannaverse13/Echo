import { NextRequest, NextResponse } from "next/server";
import { isGcpAvailable, writeDoc } from "@/lib/gcp";
import { generateJson, generateJsonWithImages } from "@/lib/genai";

// Vercel serverless function timeout. Default is 10s; Gemini video analysis
// can take 15-30s depending on length. Bump to 60s on Hobby (the max).
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/skills/reconstruct
 *
 * Body: { frameCount: number, durationSec: number }
 *
 * In a full implementation, the client would POST the actual frame blobs here
 * (multipart/form-data). For the hackathon demo, we synthesize a realistic
 * skill structure that Echo would have extracted from screen capture frames.
 *
 * Calls Gemini via the unified client (`@/lib/genai`) which tries Vertex
 * AI first (uses the GCP project's billing) then AI Studio (uses the
 * API key). Falls back to a mock when neither is available so the demo
 * always works.
 *
 * When GCP is enabled, the reconstructed skill is persisted to Firestore
 * (collection: `skills`) so the Composer and Skill Library pages can read
 * it back. Failures to write to GCP are logged but never block the
 * response — the demo must keep working without GCP configured.
 */

interface ReconstructedSkill {
  suggestedName: string;
  suggestedDescription: string;
  intent: string;
  steps: { num: number; title: string; detail: string; at: string }[];
  triggers: string[];
  integrations: string[];
}

const RECONSTRUCTION_PROMPT = `You are Echo's vision analysis engine. The user just recorded a screen capture of themselves performing a workflow. Based on the captured frames, reconstruct the workflow as a structured skill.

Return ONLY valid JSON in this exact shape:
{
  "suggestedName": "short, action-oriented (e.g. 'PDF → Sheets')",
  "suggestedDescription": "one sentence, plain language",
  "intent": "one paragraph describing what this skill accomplishes and when it should run",
  "steps": [
    { "num": 1, "title": "Step title", "detail": "What happens in this step", "at": "MM:SS" }
  ],
  "triggers": ["when this skill should run"],
  "integrations": ["apps/services involved"]
}

Keep steps between 3-7. Be specific and actionable. Use realistic MM:SS timestamps based on a 60-90 second recording.`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const {
    frameCount = 0,
    durationSec = 0,
    frames,
    video,
    videoMimeType,
  } = body as {
    frameCount?: number;
    durationSec?: number;
    frames?: string[];
    video?: string;
    videoMimeType?: string;
  };

  // ---- Video path (preferred) ----
  // The client records the entire screen as a webm and posts the full
  // blob. Gemini 1.5+ supports inline video input and can describe what
  // happens across the whole clip, including motion, scrolling, and
  // hover state — none of which a frame-sampling approach can capture.
  if (typeof video === "string" && video.length > 0) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(video);
    const videoData = m
      ? { mimeType: m[1] || videoMimeType || "video/webm", data: m[2] }
      : { mimeType: videoMimeType || "video/webm", data: video };

    const prompt = `${RECONSTRUCTION_PROMPT}\n\nThe attached file is a ${durationSec || "?"}-second screen recording of a workflow the user just performed. Watch the whole video carefully and extract the ordered steps, the intent, the right name, and the integrations involved. Be specific about what the user clicked, typed, and where the data went.`;

    const result = await generateJsonWithImages({
      model: "gemini-3.5-flash",
      prompt,
      temperature: 0.4,
      images: [
        { mimeType: videoData.mimeType, data: videoData.data },
      ],
    });
    if (result?.text) {
      try {
        const parsed = JSON.parse(result.text) as ReconstructedSkill;
        writeDoc(
          "skills",
          undefined,
          parsed as unknown as Record<string, unknown>
        ).catch(() => undefined);
        return NextResponse.json({
          ok: true,
          source: result.source,
          frameCount: 0,
          videoSeconds: durationSec,
          videoMimeType: videoData.mimeType,
          ...parsed,
        });
      } catch (err) {
        console.error("[reconstruct] Gemini video parse failed:", err);
        return NextResponse.json(
          {
            ok: false,
            error:
              "Gemini watched the video but returned a non-JSON response. Try re-recording, or fill the skill in by hand.",
          },
          { status: 502 }
        );
      }
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
  // If we got real frames, send them to Gemini as actual images.
  const realFrames = Array.isArray(frames)
    ? frames
        .filter((f): f is string => typeof f === "string" && f.length > 0)
        .map((f) => {
          // Accept both "data:image/jpeg;base64,XXX" and bare "XXX" inputs.
          const m = /^data:([^;]+);base64,(.*)$/.exec(f);
          return m
            ? { mimeType: m[1], data: m[2] }
            : { mimeType: "image/jpeg", data: f };
        })
    : [];

  const prompt = `${RECONSTRUCTION_PROMPT}\n\nThe recording captured ${realFrames.length || frameCount} frames over ${durationSec} seconds. ${
    realFrames.length > 0
      ? "The images are attached in chronological order. Analyze them to reconstruct the workflow the user actually performed on their screen."
      : "The user demonstrated a workflow on their screen (no frames are attached, so infer a plausible workflow from the metadata alone)."
  }`;

  // Strict multimodal path when we have real frames. If Gemini fails, the
  // route surfaces a 502 so the client can show a real error and let the
  // user type the skill manually. We do NOT silently fall back to a mock
  // when the user has provided real screen-capture data.
  if (realFrames.length > 0) {
    const result = await generateJsonWithImages({
      model: "gemini-3.5-flash",
      prompt,
      temperature: 0.4,
      images: realFrames,
    });
    if (result?.text) {
      try {
        const parsed = JSON.parse(result.text) as ReconstructedSkill;
        writeDoc("skills", undefined, parsed as unknown as Record<string, unknown>).catch(
          () => undefined
        );
        return NextResponse.json({
          ok: true,
          source: result.source,
          frameCount: realFrames.length,
          ...parsed,
        });
      } catch (err) {
        console.error("[reconstruct] Gemini multimodal parse failed:", err);
        return NextResponse.json(
          {
            ok: false,
            error:
              "Gemini returned a non-JSON response. The model saw your frames but couldn't extract structured steps. Try re-recording with a clearer screen, or fill the skill in by hand.",
          },
          { status: 502 }
        );
      }
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

  // Text-only fallback (no video, no frames). Gemini has no actual media
  // to look at here, so this is effectively a no-op — the prompt alone is
  // not enough to reconstruct a workflow. We keep it so the endpoint
  // still returns *something* for old clients.
  const result = await generateJson({
    model: "gemini-3.5-flash",
    prompt,
    temperature: 0.4,
  });
  if (result?.text) {
    try {
      const parsed = JSON.parse(result.text) as ReconstructedSkill;
      writeDoc("skills", undefined, parsed as unknown as Record<string, unknown>).catch(
        () => undefined
      );
      return NextResponse.json({
        ok: true,
        source: result.source,
        frameCount: 0,
        warning: "no_frames_provided",
        ...parsed,
      });
    } catch (err) {
      console.error("[reconstruct] Gemini response parse failed, falling back to mock:", err);
    }
  }

  // Fallback: realistic mock that demonstrates the full product flow
  const mock: ReconstructedSkill = {
    suggestedName: "PDF → Sheets",
    suggestedDescription:
      "Extracts tabular data from new PDFs in Drive and appends it as rows to a Google Sheet.",
    intent:
      "When a new PDF lands in a watched Google Drive folder, read the document, identify the table or line items, extract the values, and append a new row to a configured Google Sheet — with a Slack ping when done.",
    steps: [
      {
        num: 1,
        title: "Detect new PDF in Drive/Invoices",
        detail:
          "Watch the configured Drive folder for new PDF uploads. When a new file appears, download it for processing.",
        at: "00:00",
      },
      {
        num: 2,
        title: "Extract tabular data from PDF",
        detail:
          "Use Gemini Vision to identify and extract line items, totals, vendor info, and dates from the document.",
        at: "00:14",
      },
      {
        num: 3,
        title: "Map fields to sheet columns",
        detail:
          "Match extracted fields to the column headers in the destination sheet. Flag any missing or low-confidence fields for review.",
        at: "00:32",
      },
      {
        num: 4,
        title: "Append new row to Google Sheet",
        detail:
          "Add a row to the configured Google Sheet with the mapped values, preserving existing data.",
        at: "00:48",
      },
      {
        num: 5,
        title: "Notify team via Slack",
        detail:
          "Post a message to the configured Slack channel with the new row summary and a link back to the source PDF.",
        at: "01:02",
      },
    ],
    triggers: [
      "New file in Drive/Invoices folder",
      "Manual: run with file upload",
      "Schedule: daily at 9am (batch all new files)",
    ],
    integrations: ["Google Drive", "Google Sheets", "Slack"],
  };

  // Simulate a tiny bit of latency so the UI's "Reconstructing..." state is visible
  await new Promise((r) => setTimeout(r, 400));

  // Best-effort persist to Firestore (non-blocking)
  writeDoc(
    "skills",
    undefined,
    mock as unknown as Record<string, unknown>
  ).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    source: "mock",
    gcp: isGcpAvailable() ? "connected" : "disabled",
    ...mock,
  });
}
