// Test Gemini 3.5/3.6 models with the current key
const { GoogleGenAI } = require("@google/genai");

async function tryModel(name) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.log("no key"); return; }
  const genai = new GoogleGenAI({ apiKey });
  try {
    const r = await genai.models.generateContent({
      model: name,
      contents: [{ role: "user", parts: [{ text: "ping" }] }],
      config: { maxOutputTokens: 4 },
    });
    console.log("OK   " + name + ": " + (r.text?.slice(0, 60) ?? "no text"));
  } catch (e) {
    console.log("FAIL " + name + ": " + (e.message || "").slice(0, 200));
  }
}

(async () => {
  const models = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.6-flash"];
  for (const m of models) await tryModel(m);
})();
