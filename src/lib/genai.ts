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

async function tryVertex(args: GenerateArgs): Promise<GenerateResult | null> {
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
      model: args.model,
      generationConfig: {
        responseMimeType: args.responseMimeType,
        temperature: args.temperature ?? 0.4,
        maxOutputTokens: args.maxOutputTokens ?? 2048,
      },
    });
    const r = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: args.prompt }] }],
    });
    const text = r.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    return { text, source: "vertex" };
  } catch (e) {
    console.warn("[genai] vertex call failed (non-fatal):", (e as Error).message?.slice(0, 200));
    return null;
  }
}

async function tryAIStudio(args: GenerateArgs): Promise<GenerateResult | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const genai = new GoogleGenAI({ apiKey });
    const r = await genai.models.generateContent({
      model: args.model,
      contents: [{ role: "user", parts: [{ text: args.prompt }] }],
      config: {
        responseMimeType: args.responseMimeType,
        temperature: args.temperature ?? 0.4,
        maxOutputTokens: args.maxOutputTokens ?? 2048,
      },
    });
    return { text: r.text ?? "", source: "aistudio" };
  } catch (e) {
    console.warn("[genai] aistudio call failed (non-fatal):", (e as Error).message?.slice(0, 200));
    return null;
  }
}

/**
 * Call Gemini with fallback. Tries Vertex AI first when GCP is enabled,
 * then AI Studio. Returns null when both fail — caller is expected to
 * fall back to a mock.
 */
export async function generateJson(args: Omit<GenerateArgs, "responseMimeType"> & { responseMimeType?: "application/json" }): Promise<GenerateResult | null> {
  return (
    (await tryVertex({ ...args, responseMimeType: args.responseMimeType ?? "application/json" })) ??
    (await tryAIStudio({ ...args, responseMimeType: args.responseMimeType ?? "application/json" }))
  );
}
