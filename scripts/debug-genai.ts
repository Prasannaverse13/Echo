import { generateJson } from "../src/lib/genai";

(async () => {
  const r = await generateJson({
    model: "gemini-3.5-flash",
    prompt: 'You are a JSON-only agent. Respond with exactly: {"type":"thought","text":"ok"}',
    maxOutputTokens: 200,
  });
  console.log("source:", r?.source);
  console.log("text:", JSON.stringify(r?.text));
})();
