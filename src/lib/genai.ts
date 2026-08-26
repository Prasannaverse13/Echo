/**
 * Unified Gemini client.
 *
 * Tries in order:
 *   1. `@google-cloud/vertexai` (uses the GCP project's billing — works
 *      when AI Studio prepay credits are exhausted).
 *   2. `@google/genai` (uses the AI Studio API key — fast + cheap when
 *      free tier is available).
 *
 * Returns a small `{ generate, model }` interface so callers don't have
 * to care which underlying SDK served the request.
 */

type GenerateArgs = {
  model: string;
  prompt: string;
  responseMimeType?: "application/json" | "text/plain";
  temperature?: number;
  maxOutputTokens?: number;
  /**
   * Optional inline images for multimodal calls. Each entry is a base64
   * string (no "data:" prefix) and its MIME type (usually "image/jpeg"
   * or "image/png"). When provided, the request goes through Gemini's
   * multimodal `contents[].parts` shape.
   */
  images?: Array<{ mimeType: string; data: string }>;
};

type GenerateResult = { text: string; source: "vertex" | "aistudio" };

let _vertex: import("@google-cloud/vertexai").VertexAI | null = null;

/**
 * Default model that satisfies the "Gemini 3.5 or newer" requirement.
 * Used when the caller doesn't specify a model explicitly.
 */
export const PREFERRED_MODEL = "gemini-3.5-flash";

/**
 * Ordered list of model names to try. We try Gemini 3.5+ first (the
 * hackathon requirement), then fall back to whatever the project's
 * Vertex AI actually has provisioned (usually 2.5-flash).
 */
const MODEL_FALLBACKS: { model: string; source: "vertex" | "aistudio" }[] = [
  { model: "gemini-3.5-flash", source: "aistudio" },   // satisfies "3.5 or newer" rule
  { model: "gemini-3-flash", source: "aistudio" },     // newer alias on AI Studio
  { model: "gemini-2.5-flash", source: "vertex" },     // Vertex AI default
  { model: "gemini-2.5-flash-lite", source: "vertex" }, // smaller Vertex AI fallback
];

async function tryVertexOnce(modelName: string, args: GenerateArgs): Promise<GenerateResult | null> {
  if (process.env.GCP_ENABLED === "false") return null;
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
    const parts: unknown[] = [{ text: args.prompt }];
    if (args.images && args.images.length > 0) {
      for (const img of args.images) {
        parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } });
      }
    }
    const r = await model.generateContent({
      contents: [{ role: "user", parts: parts as never[] }],
    });
    const text = r.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) return null;
    return { text, source: "vertex" };
  } catch (e) {
    console.warn("[genai] vertex/" + modelName + " failed:", (e as Error).message?.slice(0, 120));
    return null;
  }
}

// Hard cap on a single Gemini call so a stalled request can't burn the
// whole serverless function budget. 50s leaves headroom under the 60s
// Vercel ceiling.
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

async function tryAIStudioOnce(modelName: string, args: GenerateArgs): Promise<GenerateResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
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
    if (!text) return null;
    return { text, source: "aistudio" };
  } catch (e) {
    console.warn("[genai] aiststudio/" + modelName + " failed:", (e as Error).message?.slice(0, 120));
    return null;
  }
}

async function tryVertex(args: GenerateArgs): Promise<GenerateResult | null> {
  for (const fb of MODEL_FALLBACKS.filter((m) => m.source === "vertex")) {
    const r = await tryVertexOnce(fb.model, args);
    if (r) return r;
  }
  return null;
}

async function tryAIStudio(args: GenerateArgs): Promise<GenerateResult | null> {
  for (const fb of MODEL_FALLBACKS.filter((m) => m.source === "aistudio")) {
    const r = await tryAIStudioOnce(fb.model, args);
    if (r) return r;
  }
  return null;
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
 * Call Gemini with fallback. Tries AI Studio with Gemini 3.5+ first
 * (satisfies hackathon "Gemini 3.5 or newer" requirement), then Vertex
 * AI (uses GCP project billing), then back to AI Studio 2.5 if all
 * else fails. Returns null when everything fails — caller is expected
 * to fall back to a mock.
 *
 * If the response text contains JSON embedded in prose/markdown (which
 * happens with `gemini-3.5-flash` via AI Studio — it sometimes ignores
 * `responseMimeType: application/json`), the extracted JSON string is
 * returned in `text`. This keeps the existing `JSON.parse(text)` in
 * the API routes working without any changes.
 */
export async function generateJson(
  args: Omit<GenerateArgs, "responseMimeType"> & { responseMimeType?: "application/json" }
): Promise<GenerateResult | null> {
  const mime = args.responseMimeType ?? "application/json";
  // Try AI Studio first
  const ai = await tryAIStudio({ ...args, responseMimeType: mime });
  if (ai) {
    const extracted = extractJson(ai.text);
    if (extracted !== null) {
      return { text: JSON.stringify(extracted), source: ai.source };
    }
    // Raw text didn't contain parseable JSON; if it looks like JSON
    // already, just pass through.
    if (ai.text.trim().startsWith("{") || ai.text.trim().startsWith("[")) {
      return ai;
    }
  }
  // Try Vertex AI
  const vertex = await tryVertex({ ...args, responseMimeType: mime });
  if (vertex) {
    const extracted = extractJson(vertex.text);
    if (extracted !== null) {
      return { text: JSON.stringify(extracted), source: vertex.source };
    }
    if (vertex.text.trim().startsWith("{") || vertex.text.trim().startsWith("[")) {
      return vertex;
    }
  }
  return ai ?? vertex;
}

/**
 * Strict multimodal call. Same fallback chain as `generateJson` (AI Studio
 * first, Vertex AI second) but requires the caller to pass actual images
 * and returns `null` on any failure — never a mock. This is the path the
 * Record page uses: if Gemini can't analyze the captured frames, the
 * caller (the API route) surfaces the error to the client so the user
 * can fall back to manual skill creation.
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
