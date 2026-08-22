import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { isGcpAvailable, writeDoc } from "@/lib/gcp";

/**
 * POST /api/skills/reconstruct
 *
 * Body: { frameCount: number, durationSec: number }
 *
 * In a full implementation, the client would POST the actual frame blobs here
 * (multipart/form-data). For the hackathon demo, we synthesize a realistic
 * skill structure that Echo would have extracted from screen capture frames.
 *
 * If GEMINI_API_KEY is set, this route calls Gemini 3.5 Flash to generate a
 * skill from a brief workflow description. Otherwise it returns a mock that
 * still demonstrates the full product flow end-to-end.
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
  const { frameCount = 24, durationSec = 64 } = body;

  // Try Gemini first if a key is configured
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const genai = new GoogleGenAI({ apiKey });
      const response = await genai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${RECONSTRUCTION_PROMPT}\n\nThe recording captured ${frameCount} frames over ${durationSec} seconds. The user demonstrated a workflow on their screen.`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0.4,
        },
      });

      const text = response.text ?? "{}";
      const parsed = JSON.parse(text) as ReconstructedSkill;
      // Best-effort persist to Firestore (non-blocking)
      writeDoc(
        "skills",
        undefined,
        parsed as unknown as Record<string, unknown>
      ).catch(() => undefined);
      return NextResponse.json({ ok: true, source: "gemini", ...parsed });
    } catch (err) {
      console.error("[reconstruct] Gemini call failed, falling back to mock:", err);
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
