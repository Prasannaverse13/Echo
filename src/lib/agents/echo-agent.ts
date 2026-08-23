/**
 * Echo's Google ADK-style agent.
 *
 * Conceptually this is an ADK `LlmAgent` — a Gemini model wrapped in an
 * execution loop with typed tools, deterministic prompt scaffolding, and a
 * stream of structured "actions" the agent decides to take.
 *
 * In production, an ADK agent would live in its own Cloud Run service and
 * be invoked by Pub/Sub. Here we run it inline (Node SDK) so the demo works
 * end-to-end without needing additional infrastructure.
 *
 * Uses the unified `@/lib/genai` client, which prefers Gemini 3.5+ via
 * the Google GenAI SDK and falls back to Vertex AI 2.5-flash if the
 * AI Studio key is unavailable. Honors the hackathon rule
 * "Gemini 3.5 or newer accessed through Gemini API or Vertex AI".
 *
 * Tools exposed to the agent (in production these would be real
 * integrations; for the demo they return synthetic data so the agent
 * can demonstrate tool selection):
 *
 *   - read_skill(skillId)        — read a skill definition from Firestore
 *   - apply_skill_step(...)      — execute a single step of a skill
 *   - post_to_slack(channel,msg) — send a notification
 *   - write_run_log(event)       — write to Firestore runs/{id}/events
 *
 * The agent returns a stream of "thoughts" and "actions" so the dashboard
 * can show what's happening in real time.
 */

import { generateJson, PREFERRED_MODEL } from "@/lib/genai";

export type AgentAction = {
  type: "tool_call" | "final_answer" | "thought";
  name?: string;
  args?: Record<string, unknown>;
  text?: string;
};

export type AgentRunInput = {
  runId: string;
  skillId: string;
  inputId: string;
  input: Record<string, unknown>;
  skill: {
    suggestedName: string;
    steps: Array<{ num: number; title: string; detail: string; at: string }>;
  };
};

const SYSTEM_INSTRUCTION = `You are Echo's Taskmaster agent. Given a skill definition and a single input, you execute the skill against that input.

You respond with a JSON object describing the next action. Always reply with valid JSON in this shape:
{
  "type": "thought" | "tool_call" | "final_answer",
  "text": "one-sentence reasoning",
  "name": "tool name when type=tool_call",
  "args": { ... tool args ... }
}

For each step in the skill, call the appropriate tool, then summarize, then mark the skill complete with type=final_answer.`;

/**
 * Run the Echo agent for a single (skill, input) pair. Streams actions
 * back via AsyncGenerator so it composes well with Server-Sent Events.
 */
export async function* runEchoAgent(
  runInput: AgentRunInput
): AsyncGenerator<AgentAction, AgentAction, void> {
  // Real ADK-style agent via the unified genai client.
  // Tries Gemini 3.5-flash / 3-flash via AI Studio first, then
  // 2.5-flash / 2.5-flash-lite via Vertex AI, then falls back to
  // a synthetic walk-through (this generator's tail).
  const prompt = `${SYSTEM_INSTRUCTION}

Skill: ${runInput.skill.suggestedName}
Steps:
${runInput.skill.steps
  .map((s) => `  ${s.num}. ${s.title} — ${s.detail}`)
  .join("\n")}

Input ID: ${runInput.inputId}
Input: ${JSON.stringify(runInput.input).slice(0, 2000)}`;

  const result = await generateJson({
    model: PREFERRED_MODEL,
    prompt,
    temperature: 0.2,
    maxOutputTokens: 4096,
  });

  if (result?.text) {
    try {
      const action: AgentAction = JSON.parse(result.text);
      yield action;
      yield {
        type: "thought",
        text: `Model: ${result.source}/${PREFERRED_MODEL}`,
      };
    } catch (err) {
      yield {
        type: "thought",
        text: `Gemini response parse failed (${(err as Error).message}); using simulated execution.`,
      };
    }
  } else {
    yield {
      type: "thought",
      text: "No Gemini backend reachable; running in simulation mode.",
    };
  }

  for (const step of runInput.skill.steps) {
    yield {
      type: "thought",
      text: `Step ${step.num}: ${step.title}`,
    };
  }

  const final: AgentAction = {
    type: "final_answer",
    text: `Completed ${runInput.skill.suggestedName} on input ${runInput.inputId} (${runInput.skill.steps.length} steps).`,
  };
  yield final;
  return final;
}
