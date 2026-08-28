import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * POST /api/skills/transcribe
 *
 * Server-side speech-to-text for the recorder's mic capture. The client
 * records a `audio/webm;codecs=opus` blob (or .wav fallback) using
 * `MediaRecorder` and POSTs it here. We send it to OpenAI's
 * `gpt-4o-transcribe` model (configurable) and return the text + rough
 * segment timestamps.
 *
 * Body: { audio: string (data URL or raw base64), mimeType?: string, language?: string }
 *
 * Returns: { ok, text, segments: [{ atMs, text }], source }
 *
 * Falls back to a no-op (empty text) if no API key is configured — the
 * recorder is usable without narration, the describer just loses the most
 * direct statement of intent.
 */
const TRANSCRIBE_MODELS = [
  "gpt-4o-transcribe",
  "whisper-1",
] as const;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      source: "noop",
      text: "",
      segments: [],
      warning: "OPENAI_API_KEY not set — narration was not transcribed",
    });
  }

  const body = await req.json().catch(() => ({}));
  const { audio, mimeType, language } = body as {
    audio?: string;
    mimeType?: string;
    language?: string;
  };
  if (typeof audio !== "string" || audio.length === 0) {
    return NextResponse.json(
      { ok: false, error: "audio is required" },
      { status: 400 }
    );
  }

  const { mime, data } = parseAudio(audio, mimeType);
  const ext = mime.includes("webm") ? "webm" : mime.includes("wav") ? "wav" : mime.includes("ogg") ? "ogg" : "mp3";

  // Build multipart/form-data manually (Node 20+ fetch on Vercel supports
  // FormData with Blob parts, but the OpenAI endpoint expects an actual
  // multipart upload, so we use the FormData/Blob approach).
  const blob = base64ToBlob(data, mime);
  const form = new FormData();
  form.append("file", blob, `recording.${ext}`);
  form.append("model", TRANSCRIBE_MODELS[0]);
  form.append("response_format", "verbose_json");
  if (language) form.append("language", language);

  try {
    const r = await fetchWithTimeout(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      },
      50_000
    );
    if (!r.ok) {
      const err = await r.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: `OpenAI transcription failed: ${r.status} ${err.slice(0, 200)}`,
        },
        { status: 502 }
      );
    }
    const j = (await r.json()) as {
      text?: string;
      segments?: Array<{ start?: number; end?: number; text?: string }>;
    };
    const text = j.text ?? "";
    const segments = (j.segments ?? [])
      .filter((s) => typeof s.text === "string" && s.text.trim())
      .map((s) => ({
        atMs: Math.max(0, Math.round((s.start ?? 0) * 1000)),
        text: s.text!.trim(),
      }));
    return NextResponse.json({
      ok: true,
      source: TRANSCRIBE_MODELS[0],
      text,
      segments,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error:
          e instanceof Error
            ? `Transcription error: ${e.message}`
            : "Transcription failed",
      },
      { status: 502 }
    );
  }
}

function parseAudio(s: string, fallbackMime: string | undefined): { mime: string; data: string } {
  const safeFallback = fallbackMime ?? "application/octet-stream";
  if (s.startsWith("data:")) {
    const b64Idx = s.indexOf(";base64,");
    if (b64Idx > 5) {
      const rawMime = s.slice(5, b64Idx);
      const baseType = rawMime.split(";")[0].trim().toLowerCase();
      return { mime: baseType || safeFallback, data: s.slice(b64Idx + ";base64,".length) };
    }
  }
  return { mime: safeFallback, data: s };
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  return Promise.race([
    fetch(url, init),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error(`transcribe fetch timed out after ${ms}ms`)), ms)
    ),
  ]);
}
