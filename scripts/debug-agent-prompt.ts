import { generateJson, PREFERRED_MODEL } from "../src/lib/genai";

(async () => {
  const systemInstruction = `You are Echo's Taskmaster agent. Given a skill definition and a single input, you execute the skill against that input.

You respond with a JSON object describing the next action. Always reply with valid JSON in this shape:
{
  "type": "thought" | "tool_call" | "final_answer",
  "text": "one-sentence reasoning",
  "name": "tool name when type=tool_call",
  "args": { ... tool args ... }
}

For each step in the skill, call the appropriate tool, then summarize, then mark the skill complete with type=final_answer.`;

  const prompt = `${systemInstruction}

Skill: Invoice → Sheet
Steps:
  1. Read invoice — Parse the PDF
  2. Append to sheet — Add a row to the Sheet

Input ID: input-1
Input: {"customer":"ACME","amount":1234}`;

  const r = await generateJson({
    model: PREFERRED_MODEL,
    prompt,
    temperature: 0.2,
    maxOutputTokens: 4096,
  });
  console.log("source:", r?.source);
  console.log("text (raw):");
  console.log(r?.text);
})();
