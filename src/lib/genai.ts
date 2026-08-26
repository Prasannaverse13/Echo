/**
 * Unified Gemini client.
 *
 * Tries in order:
 *   1. `@google/genai` against AI Studio using the model the caller
 *      requested (most production-friendly path; uses the API key
 *      configured in `GEMINI_API_KEY`).
 *   2. `@google-cloud/vertexai` using the GCP project's billing — only
 *      attempted as a fallback for the text-only path. Vertex AI
 *      cannot be used for video inline data on Vercel because we have
 *      no WIF / ADC setup there, so the multimodal path skips it
 *      entirely.
 *
 * Returns `{ text, source }` on success, or `null` when every attempt
 * failed. The caller is expected to surface a clear error to the
 * client in that case (the API routes do this — no silent mock).
 *
 * Model selection: the caller's `args.model` is the primary choice.
 * We also accept a small hard-coded fallback list (in case the
 * caller's preferred model is rate-limited or temporarily unavailable
 * on AI Studio).
 */

type GenerateArgs = {
  model: string;
  prompt: string;
  responseMimeType?: "application/json" | "text/plain";
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Optional inline media for multimodal calls. Each entry is a base64
   * string (no "data:" prefix) and its MIME type:
   *   - "image/jpeg" / "image/png" for stills
   *   - "video/webm" / "video/mp4" for short screen recordings
   * When provided, the request goes through Gemini's multimodal
   * `contents[].parts` shape and is limited to AI Studio (Vertex AI
   * path is skipped — see header comment).
   */
  images?: Array<{ mimeType: string; data: string }>;
};

type GenerateResult = { text: string; source: "vertex" | "aistudio" };

let _vertex: import("@google-cloud/vertexai").VertexAI | null = null;

/**
 * Default model for plain-text calls. The Record page passes an
 * explicit `args.model` so this is only the default for callers that
 * don't specify one (e.g. the agent orchestrator's JSON extraction
 * helper). Uses the latest AI Studio Flash tier — the 2.x family is
 * no longer available to new users.
 */
export const PREFERRED_MODEL = "gemini-3.5-flash";

/**
 * Hard-coded fallback list. The caller's `args.model` is tried first;
 * these are tried only if it fails. Keep this list small and only
 * include model names that are GA on AI Studio today (Aug 2026+).
 * The 2.x family is sunset for new users, so we live on the 3.x line.
 */
const FALLBACK_MODELS: { model: string; source: "vertex" | "aistudio" }[] = [
  { model: "gemini-3.5-flash", source: "aistudio" },
  { model: "gemini-3.6-flash", source: "aistudio" },
  { model: "gemini-3.5-flash-lite", source: "aistudio" },
];

/**
 * Hard cap on a single Gemini call so a stalled request can't burn the
 * whole serverless function budget. 50s leaves headroom under the 60s
 * Vercel ceiling (and well under the 120s ceiling if the user has
 * upgraded to Pro).
 */
const GEMINI_TIMEOUT_MS = 50_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms}ms`)),
        ms
      )
    ),
  ]);
}

/**
 * Build the list of model attempts: caller's choice first (marked
 * "aistudio" so we always go through the API key path), then the
 * hard-coded fallbacks.
 */
function attemptsFor(args: GenerateArgs): { model: string; source: "vertex" | "aistudio" }[] {
  const out: { model: string; source: "vertex" | "aistudio" }[] = [];
  if (args.model) {
    out.push({ model: args.model, source: "aistudio" });
  }
  for (const fb of FALLBACK_MODELS) {
    if (!out.some((a) => a.model === fb.model)) {
      out.push(fb);
    }
  }
  return out;
}

async function tryAIStudioOnce(
  modelName: string,
  args: GenerateArgs
): Promise<GenerateResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("[genai] GEMINI_API_KEY not set — skipping aistudio/" + modelName);
    return null;
  }
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const genai = new GoogleGenAI({ apiKey });
    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      { text: args.prompt },
    ];
    if (args.images && args.images.length > 0) {
      for (const img of args.images) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      }
    }
    const r = await withTimeout(
      genai.models.generateContent({
        model: modelName,
        contents: [{ role: "user", parts }],
        config: {
          responseMimeType: args.responseMimeType,
          temperature: args.temperature ?? 0.4,
          maxOutputTokens: args.maxOutputTokens ?? 4096,
        },
      }),
      GEMINI_TIMEOUT_MS,
      `AI Studio ${modelName}`
    );
    const text = r.text ?? "";
    if (!text) {
      console.warn(`[genai] aistudio/${modelName} returned empty text`);
      return null;
    }
    return { text, source: "aistudio" };
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.warn(`[genai] aistudio/${modelName} failed: ${msg.slice(0, 200)}`);
    return null;
  }
}

async function tryVertexOnce(
  modelName: string,
  args: GenerateArgs
): Promise<GenerateResult | null> {
  if (process.env.GCP_ENABLED === "false") return null;
  // Vertex AI cannot accept inline media on Vercel — there's no ADC
  // setup that would let it authenticate. Skip entirely for multimodal.
  if (args.images && args.images.length > 0) return null;
  try {
    if (!_vertex) {
      const { VertexAI } = await import("@google-cloud/vertexai");
      _vertex = new VertexAI({
        project: process.env.GCP_PROJECT_ID || "echo-hackathon-2026",
        location: process.env.GCP_VERTEX_LOCATION || "us-central1",
      });
    }
    const model = _vertex.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: args.responseMimeType,
        temperature: args.temperature ?? 0.4,
        maxOutputTokens: args.maxOutputTokens ?? 4096,
      },
    });
    const r = await withTimeout(
      model.generateContent({
        contents: [{ role: "user", parts: [{ text: args.prompt }] }],
      }),
      GEMINI_TIMEOUT_MS,
      `Vertex ${modelName}`
    );
    const text = r.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) {
      console.warn(`[genai] vertex/${modelName} returned empty text`);
      return null;
    }
    return { text, source: "vertex" };
  } catch (e) {
    const msg = (e as Error)?.message ?? String(e);
    console.warn(`[genai] vertex/${modelName} failed: ${msg.slice(0, 200)}`);
    return null;
  }
}

async function tryOne(
  attempt: { model: string; source: "vertex" | "aistudio" },
  args: GenerateArgs
): Promise<GenerateResult | null> {
  if (attempt.source === "aistudio") {
    return tryAIStudioOnce(attempt.model, args);
  }
  return tryVertexOnce(attempt.model, args);
}

/**
 * Extract a JSON object/array from a model response that may be wrapped
 * in markdown fences or prefixed with "Here is ..." prose. Returns the
 * parsed value or null if no JSON can be found.
 */
function extractJson(text: string): unknown | null {
  let t = text.trim();
  // Strip markdown code fences ```json ... ```
  if (t.startsWith("```")) {
    t = t.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/, "").trim();
  }
  // Direct parse
  try {
    return JSON.parse(t);
  } catch {}
  // Find the first { ... } or [ ... ] block
  const objStart = t.indexOf("{");
  const objEnd = t.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) {
    try {
      return JSON.parse(t.slice(objStart, objEnd + 1));
    } catch {}
  }
  const arrStart = t.indexOf("[");
  const arrEnd = t.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) {
    try {
      return JSON.parse(t.slice(arrStart, arrEnd + 1));
    } catch {}
  }
  return null;
}

/**
 * Call Gemini with fallback. Tries the caller's `args.model` first via
 * AI Studio, then walks a small hard-coded fallback list. Returns
 * `null` when everything fails — caller surfaces a real error.
 *
 * If the response text contains JSON embedded in prose/markdown (which
 * happens with some models that ignore `responseMimeType`), the
 * extracted JSON string is returned in `text` so callers can keep
 * doing `JSON.parse(text)`.
 */
export async function generateJson(
  args: Omit<GenerateArgs, "responseMimeType"> & { responseMimeType?: "application/json" }
): Promise<GenerateResult | null> {
  const mime = args.responseMimeType ?? "application/json";
  const attempts = attemptsFor(args);
  for (const attempt of attempts) {
    const r = await tryOne(attempt, { ...args, responseMimeType: mime });
    if (!r) continue;
    // We have a response. Try to extract JSON. If the model returned
    // parseable JSON (or JSON embedded in prose), return it; otherwise
    // pass the raw text through so the caller can decide.
    const extracted = extractJson(r.text);
    if (extracted !== null) {
      return { text: JSON.stringify(extracted), source: r.source };
    }
    if (r.text.trim().startsWith("{") || r.text.trim().startsWith("[")) {
      return r;
    }
    // The model gave us prose without JSON — try the next fallback.
    console.warn(`[genai] ${attempt.source}/${attempt.model} returned non-JSON prose; trying next`);
  }
  return null;
}

/**
 * Strict multimodal call. Same fallback chain as `generateJson` (caller
 * model first via AI Studio, then hard-coded fallbacks) but requires
 * the caller to pass actual media and returns `null` on any failure —
 * never a mock. This is the path the Record page uses: if Gemini can't
 * analyze the captured video, the caller (the API route) surfaces the
 * error to the client so the user can fall back to manual skill
 * creation.
 */
export async function generateJsonWithImages(
  args: Omit<GenerateArgs, "responseMimeType" | "images"> & {
    responseMimeType?: "application/json";
    images: Array<{ mimeType: string; data: string }>;
  }
): Promise<GenerateResult | null> {
  if (!args.images || args.images.length === 0) {
    throw new Error("generateJsonWithImages requires at least one image");
  }
  return generateJson(args);
}
