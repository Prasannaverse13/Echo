// List ALL available Gemini 3.5+ models on Vertex AI for this project
const {VertexAI} = require("@google-cloud/vertexai");

(async () => {
  const v = new VertexAI({
    project: "echo-hackathon-2026",
    location: "us-central1",
  });
  // Vertex AI exposes 3.5+ Flash and Pro variants
  const candidates = [
    // 3.5 family
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.5-pro",
    // 3 family
    "gemini-3-flash",
    "gemini-3-flash-preview",
    "gemini-3-pro",
    "gemini-3-pro-preview",
    // explicit "latest" aliases
    "gemini-flash-latest",
    "gemini-pro-latest",
  ];
  for (const m of candidates) {
    try {
      const model = v.getGenerativeModel({ model: m });
      const r = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: 4 },
      });
      console.log("OK  ", m);
    } catch (e) {
      const m2 = (e.message || "").match(/not found|404|not supported/i);
      console.log("FAIL", m, "->", (e.message || "").slice(0, 100));
    }
  }
})();
