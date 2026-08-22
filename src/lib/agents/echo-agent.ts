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

import { VertexAI, type Content } from "@google-cloud/vertexai";

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

let _vertex: VertexAI | null = null;

function getVertex(): VertexAI {
  if (!_vertex) {
    const project = process.env.GCP_PROJECT_ID || "echo-hackathon-2026";
    const location = process.env.GCP_VERTEX_LOCATION || "us-central1";
    _vertex = new VertexAI({ project, location });
  }
  return _vertex;
}

export function isVertexAvailable(): boolean {
  return Boolean(process.env.GCP_PROJECT_ID) && process.env.GCP_ENABLED !== "false";
}

/**
 * Run the Echo agent for a single (skill, input) pair. Streams actions
 * back via the provided callback. This is intentionally a generator so
 * it composes well with Server-Sent Events in the future.
 */
export async function* runEchoAgent(
  runInput: AgentRunInput
): AsyncGenerator<AgentAction, AgentAction, void> {
  if (!isVertexAvailable()) {
    // Mock: walk through skill steps with synthetic tool calls
    for (const step of runInput.skill.steps) {
      yield {
        type: "thought",
        text: `Step ${step.num}: ${step.title}`,
      };
      yield {
        type: "tool_call",
        name: "apply_skill_step",
        args: {
          skillId: runInput.skillId,
          stepNum: step.num,
          inputId: runInput.inputId,
        },
        text: step.title,
      };
    }
    return {
      type: "final_answer",
      text: `Completed ${runInput.skill.suggestedName} on input ${runInput.inputId} (${runInput.skill.steps.length} steps).`,
    };
  }

  // Real ADK-style agent via Vertex AI Gemini
  const vertex = getVertex();
  const model = vertex.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: { role: "system", parts: [{ text: SYSTEM_INSTRUCTION }] },
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });

  const contents: Content[] = [
    {
      role: "user",
      parts: [
        {
          text: `Skill: ${runInput.skill.suggestedName}\nSteps:\n${runInput.skill.steps
            .map((s) => `  ${s.num}. ${s.title} — ${s.detail}`)
            .join("\n")}\n\nInput ID: ${runInput.inputId}\nInput: ${JSON.stringify(runInput.input).slice(0, 2000)}`,
        },
      ],
    },
  ];

  // Run a single LLM turn and yield the action. A full agent loop would
  // feed tool results back into `contents`; for the demo we surface the
  // first thought + a final answer.
  try {
    const result = await model.generateContent({ contents });
    const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const action: AgentAction = JSON.parse(text);
    yield action;
  } catch (err) {
    yield {
      type: "thought",
      text: `Vertex AI call failed (${(err as Error).message}); falling back to simulated execution.`,
    };
  }

  for (const step of runInput.skill.steps) {
    yield {
      type: "thought",
      text: `Step ${step.num}: ${step.title}`,
    };
  }

  return {
    type: "final_answer",
    text: `Completed ${runInput.skill.suggestedName} on input ${runInput.inputId} (${runInput.skill.steps.length} steps).`,
  };
}
