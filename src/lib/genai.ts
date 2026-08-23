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
    const r = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: args.prompt }] }],
    });
    const text = r.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    if (!text) return null;
    return { text, source: "vertex" };
  } catch (e) {
    console.warn("[genai] vertex/" + modelName + " failed:", (e as Error).message?.slice(0, 120));
    return null;
  }
}

async function tryAIStudioOnce(modelName: string, args: GenerateArgs): Promise<GenerateResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const genai = new GoogleGenAI({ apiKey });
    const r = await genai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: args.prompt }] }],
      config: {
        responseMimeType: args.responseMimeType,
        temperature: args.temperature ?? 0.4,
        maxOutputTokens: args.maxOutputTokens ?? 4096,
      },
    });
    const text = r.text ?? "";
    if (!text) return null;
    return { text, source: "aistudio" };
  } catch (e) {
    console.warn("[genai] aistudio/" + modelName + " failed:", (e as Error).message?.slice(0, 120));
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
 * Call Gemini with fallback. Tries AI Studio with Gemini 3.5+ first
 * (satisfies hackathon "Gemini 3.5 or newer" requirement), then Vertex
 * AI (uses GCP project billing), then back to AI Studio 2.5 if all
 * else fails. Returns null when everything fails — caller is expected
 * to fall back to a mock.
 */
export async function generateJson(
  args: Omit<GenerateArgs, "responseMimeType"> & { responseMimeType?: "application/json" }
): Promise<GenerateResult | null> {
  return (
    (await tryAIStudio({ ...args, responseMimeType: args.responseMimeType ?? "application/json" })) ??
    (await tryVertex({ ...args, responseMimeType: args.responseMimeType ?? "application/json" }))
  );
}
