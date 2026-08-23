// Try public Gemini API for Gemini 3.5+ models
const {GoogleGenAI} = require("@google/genai");

(async () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("No GEMINI_API_KEY in env");
    process.exit(1);
  }
  const genai = new GoogleGenAI({ apiKey });
  const candidates = [
    "gemini-3.5-flash",
    "gemini-3.5-pro",
    "gemini-3.6-flash",
    "gemini-3.6-pro",
    "gemini-3-flash",
    "gemini-3-pro",
    "gemini-flash-latest",
    "gemini-pro-latest",
  ];
  for (const m of candidates) {
    try {
      const r = await genai.models.generateContent({
        model: m,
        contents: [{ role: "user", parts: [{ text: "ping" }] }],
        config: { maxOutputTokens: 4 },
      });
      console.log("OK  ", m, "->", (r.text || "(empty)").slice(0, 30));
    } catch (e) {
      console.log("FAIL", m, "->", (e.message || "").slice(0, 150));
    }
  }
})();
