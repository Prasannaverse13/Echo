// Try Vertex AI Gemini 3.x in the "global" region
const {VertexAI} = require("@google-cloud/vertexai");

(async () => {
  const locations = ["global", "us-central1", "us-east5"];
  const models = [
    "gemini-3.5-flash",
    "gemini-3.5-pro",
    "gemini-3-flash",
    "gemini-3-pro",
  ];
  for (const location of locations) {
    for (const m of models) {
      try {
        const v = new VertexAI({ project: "echo-hackathon-2026", location });
        const model = v.getGenerativeModel({ model: m });
        const r = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 4 },
        });
        console.log("OK  ", location, "/", m);
      } catch (e) {
        console.log("FAIL", location, "/", m, "->", (e.message || "").slice(0, 100));
      }
    }
  }
})();
