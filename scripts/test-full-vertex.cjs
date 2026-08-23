// Test full Gemini response via Vertex AI
const {VertexAI} = require("@google-cloud/vertexai");

(async () => {
  const v = new VertexAI({
    project: "echo-hackathon-2026",
    location: "us-central1",
  });
  const model = v.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.4,
      maxOutputTokens: 2048,
    },
  });
  const prompt = `You are Echo's vision analysis engine. The user just recorded a screen capture. Return ONLY valid JSON with: suggestedName, suggestedDescription, intent, steps (3-7 items with num/title/detail/at), triggers, integrations. Keep it short.`;
  const r = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  const text = r.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "(empty)";
  console.log("FULL TEXT:");
  console.log(text);
  console.log("---LENGTH:", text.length);
})();
