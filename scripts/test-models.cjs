// Test which Gemini models are available with the current key
const { GoogleGenAI } = require("@google/genai");

async function tryModel(name) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { console.log("no key"); return; }
  const genai = new GoogleGenAI({ apiKey });
  try {
    const r = await genai.models.generateContent({
      model: name,
      contents: [{ role: "user", parts: [{ text: "ping" }] }],
    });
    console.log(`OK   ${name}: ${r.text?.slice(0, 60) ?? "no text"}`);
  } catch (e) {
    const m = (e.message || "").slice(0, 200);
    console.log(`FAIL ${name}: ${m}`);
  }
}

(async () => {
  const models = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-flash-latest",
    "gemini-3-flash-preview",
    "gemini-flash-latest",
  ];
  for (const m of models) await tryModel(m);
})();
