// List Vertex AI Gemini models available to this project
const {VertexAI} = require("@google-cloud/vertexai");

(async () => {
  const v = new VertexAI({
    project: "echo-hackathon-2026",
    location: "us-central1",
  });
  const candidates = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-flash-002",
    "gemini-1.5-pro",
    "gemini-1.0-pro",
  ];
  for (const m of candidates) {
    try {
      const model = v.getGenerativeModel({ model: m });
      const r = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: "ping" }] }],
        generationConfig: { maxOutputTokens: 4 },
      });
      const text = r.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "(empty)";
      console.log("OK  ", m, "->", text);
    } catch (e) {
      console.log("FAIL", m, "->", (e.message || "").slice(0, 100));
    }
  }
})();
