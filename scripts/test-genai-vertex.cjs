// Use the new @google/genai SDK with vertexai: true backend
const {GoogleGenAI} = require("@google/genai");

(async () => {
  const ai = new GoogleGenAI({
    vertexai: true,
    project: "echo-hackathon-2026",
    location: "us-central1",
  });
  const models = [
    "gemini-3.5-flash",
    "gemini-3.5-pro",
    "gemini-3-flash",
    "gemini-3-pro",
    "gemini-2.5-flash",
  ];
  for (const m of models) {
    try {
      const r = await ai.models.generateContent({
        model: m,
        contents: [{ role: "user", parts: [{ text: "ping" }] }],
        config: { maxOutputTokens: 4 },
      });
      console.log("OK  ", m, "->", (r.text || "(empty)").slice(0, 30));
    } catch (e) {
      console.log("FAIL", m, "->", (e.message || "").slice(0, 100));
    }
  }
})();
