/**
 * Echo's Google ADK-style agent.
 *
 * Conceptually this is an ADK `LlmAgent` — a Gemini model wrapped in an
 * execution loop with typed tools, deterministic prompt scaffolding, and a
 * stream of structured "actions" the agent decides to take.
 *
 * The agent now has *real* tools backed by a Playwright browser executor
 * (`@/lib/browser-executor`) so it can actually do the workflows the
 * user recorded — open Gmail, draft an email, save it; open a sheet,
 * paste rows, etc. — instead of just hallucinating the result.
 *
 * Tools exposed to the agent:
 *   - browser_navigate(url)                  — go to a URL
 *   - browser_click(selector)                 — click an element
 *   - browser_fill(selector, value)           — fill a form field
 *   - browser_type(selector, text, delayMs?)  — type with delay
 *   - browser_press(selector?, key)           — keyboard press
 *   - browser_extract(selector, attribute?)   — read DOM values
 *   - browser_wait(selector?, ms?)            — wait for selector or ms
 *   - browser_screenshot(fullPage?)           — take a screenshot
 *   - browser_scroll(direction, amount?)      — scroll the page
 *   - finish(summary)                        — mark the input done
 *
 * The agent returns a stream of "thoughts" and "actions" so the
 * dashboard can show what's happening in real time.
 *
 * In dev (no `BROWSER_EXECUTOR_URL`), the tools degrade to a mock
 * executor so the loop still runs end-to-end without Chromium.
 */

import { generateJson, PREFERRED_MODEL } from "@/lib/genai";
import {
  executeBrowserActions,
  endBrowserSession,
  type BrowserAction,
  type BrowserActionResult,
} from "@/lib/browser-executor";

export type AgentAction = {
  type: "tool_call" | "final_answer" | "thought" | "screenshot";
  name?: string;
  args?: Record<string, unknown>;
  text?: string;
  // For screenshot actions, the data URL of the captured page
  screenshot?: string;
};

export type AgentRunInput = {
  runId: string;
  inputId: string;
  skillId: string;
  input: Record<string, unknown>;
  skill: {
    suggestedName: string;
    intent?: string;
    steps: Array<{ num: number; title: string; detail: string; at: string }>;
    integrations?: string[];
  };
  goal?: string;
};

// ---------- Tool definitions (advertised to Gemini) ----------

const TOOL_DEFS = [
  {
    name: "browser_navigate",
    description:
      "Open a URL in a real headless browser. Use this to start any workflow.",
    parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
  },
  {
    name: "browser_click",
    description: "Click an element matched by a CSS selector.",
    parameters: { type: "object", properties: { selector: { type: "string" } }, required: ["selector"] },
  },
  {
    name: "browser_fill",
    description: "Clear and fill a form field.",
    parameters: {
      type: "object",
      properties: { selector: { type: "string" }, value: { type: "string" } },
      required: ["selector", "value"],
    },
  },
  {
    name: "browser_type",
    description:
      "Type text character-by-character into a focused field (useful for autocomplete).",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string" },
        text: { type: "string" },
        delayMs: { type: "number" },
      },
      required: ["selector", "text"],
    },
  },
  {
    name: "browser_press",
    description: "Press a keyboard key, optionally on a specific element.",
    parameters: {
      type: "object",
      properties: { selector: { type: "string" }, key: { type: "string" } },
      required: ["key"],
    },
  },
  {
    name: "browser_extract",
    description:
      "Read a list of values from DOM elements. Returns the text, innerText, value, html, or a custom attribute for every match.",
    parameters: {
      type: "object",
      properties: {
        selector: { type: "string" },
        attribute: {
          type: "string",
          enum: ["text", "innerText", "value", "html", "href"],
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "browser_wait",
    description:
      "Wait for a CSS selector to appear, or simply sleep for N milliseconds.",
    parameters: {
      type: "object",
      properties: { selector: { type: "string" }, ms: { type: "number" } },
    },
  },
  {
    name: "browser_screenshot",
    description: "Take a PNG screenshot of the current page. Returns a data URL.",
    parameters: { type: "object", properties: { fullPage: { type: "boolean" } } },
  },
  {
    name: "browser_scroll",
    description: "Scroll the page up or down.",
    parameters: {
      type: "object",
      properties: {
        direction: { type: "string", enum: ["up", "down"] },
        amount: { type: "number" },
      },
      required: ["direction"],
    },
  },
  {
    name: "finish",
    description:
      "Mark the skill as complete on this input. Provide a 1-2 sentence summary of what was done and the result.",
    parameters: {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
    },
  },
] as const;

// ---------- Prompt scaffolding ----------

const SYSTEM_INSTRUCTION = `You are Echo's Taskmaster agent. You execute a recorded skill against a single input, in a real headless browser.

You have these tools (call one at a time):
${TOOL_DEFS.map((t) => `  - ${t.name}(${Object.keys(t.parameters.properties).join(", ")}) — ${t.description}`).join("\n")}

Workflow:
1. Call browser_navigate to the first URL mentioned by the skill.
2. Step through each skill step, calling the appropriate browser_* tool.
3. When you have the result you need, call finish with a 1-2 sentence summary.

Always reply with valid JSON in this shape:
{ "type": "thought" | "tool_call" | "final_answer", "text": "reasoning", "name": "tool name when type=tool_call", "args": { ... } }

Be efficient: do not take screenshots unless you actually need visual confirmation. If a step is purely informational, finish as soon as you can.`;

// ---------- Agent loop ----------

const MAX_TOOL_ITERATIONS = 20;
const TOOL_BATCH_WINDOW_MS = 0; // one tool call per Gemini turn (safer)

/**
 * Run the Echo agent for a single (skill, input) pair. Streams actions
 * back via AsyncGenerator so it composes well with Server-Sent Events.
 */
export async function* runEchoAgent(
  runInput: AgentRunInput
): AsyncGenerator<AgentAction, AgentAction, void> {
  yield {
    type: "thought",
    text: `Starting ${runInput.skill.suggestedName} on input ${runInput.inputId} (${runInput.skill.steps.length} step skill).`,
  };

  // 1) Try a real Gemini call up front to seed the plan. If the model
  //    is reachable, we use it to pick the first browser action. If not,
  //    we fall back to a deterministic walk-through.
  const seed = await generateJson({
    model: PREFERRED_MODEL,
    prompt: `${SYSTEM_INSTRUCTION}

SKILL: ${runInput.skill.suggestedName}
${runInput.skill.intent ? `INTENT: ${runInput.skill.intent}\n` : ""}STEPS:
${runInput.skill.steps.map((s) => `  ${s.num}. ${s.title} — ${s.detail}`).join("\n")}
${runInput.goal ? `\nUSER GOAL: ${runInput.goal}\n` : ""}INPUT: ${JSON.stringify(runInput.input).slice(0, 2000)}

What's the FIRST browser action to take? Reply with one tool_call JSON.`,
    temperature: 0.2,
    maxOutputTokens: 1024,
  });

  if (seed?.text) {
    try {
      const parsed = JSON.parse(seed.text) as AgentAction;
      yield parsed;
    } catch {
      /* fall through to scripted walk */
    }
  }

  // 2) Walk the skill steps. For each step, either dispatch a single
  //    browser action (extracted from the step title by simple regex) or
  //    call Gemini to pick the action. We bias toward the latter when
  //    the step looks concrete (mentions a URL/button/field).
  for (let i = 0; i < runInput.skill.steps.length; i++) {
    const step = runInput.skill.steps[i];
    yield { type: "thought", text: `Step ${step.num}/${runInput.skill.steps.length}: ${step.title}` };

    const inferred = inferBrowserActionsFromStep(step, runInput);
    if (inferred && inferred.length > 0) {
      // Run inferred actions
      const resp = await executeBrowserActions(runInput.runId, runInput.inputId, inferred);
      yield* yieldBrowserResults(resp);
    } else {
      // Ask Gemini what to do for this step
      const decision = await generateJson({
        model: PREFERRED_MODEL,
        prompt: `${SYSTEM_INSTRUCTION}

CURRENT STEP: ${step.title} — ${step.detail}
PAGE STATE: ${runInput.skill.intent ?? "unknown"}

Reply with ONE tool_call JSON (no other text).`,
        temperature: 0.2,
        maxOutputTokens: 512,
      });
      if (decision?.text) {
        try {
          const action = JSON.parse(decision.text) as AgentAction;
          yield action;
          if (action.type === "tool_call" && action.name) {
            const mapped = mapToolCallToBrowserAction(action);
            if (mapped) {
              const resp = await executeBrowserActions(
                runInput.runId,
                runInput.inputId,
                [mapped]
              );
              yield* yieldBrowserResults(resp);
            }
          }
        } catch {
          /* ignore parse errors and continue */
        }
      }
    }

    // Hard cap on iterations
    if (i >= MAX_TOOL_ITERATIONS) break;
  }

  // 3) Always take one final screenshot so the dashboard has a "this is
  //    what the agent saw" image, then close the browser session.
  const finalShot = await executeBrowserActions(runInput.runId, runInput.inputId, [
    { type: "screenshot" },
  ]);
  yield* yieldBrowserResults(finalShot);
  await endBrowserSession(runInput.runId, runInput.inputId);

  const final: AgentAction = {
    type: "final_answer",
    text: `Completed ${runInput.skill.suggestedName} on input ${runInput.inputId} (${runInput.skill.steps.length} steps).`,
  };
  yield final;
  return final;
}

// ---------- Helpers ----------

/**
 * Very lightweight inference: if a skill step mentions a URL, a button
 * name, or a field name, derive a tiny action plan without going to
 * Gemini. This keeps the demo snappy and gives the user a visible
 * "the agent is doing things" loop even when Gemini is slow or absent.
 */
function inferBrowserActionsFromStep(
  step: { title: string; detail: string; at: string },
  _run: AgentRunInput
): BrowserAction[] | null {
  const text = `${step.title} ${step.detail}`;
  const actions: BrowserAction[] = [];

  // URL?
  const urlMatch = text.match(/https?:\/\/\S+/);
  if (urlMatch) {
    actions.push({ type: "navigate", url: urlMatch[0] });
  }
  // Click?
  const clickMatch = text.match(/click\s+(?:on\s+)?[`"']?([^`"';.]+)[`"']?/i);
  if (clickMatch) {
    actions.push({ type: "click", selector: `text=${clickMatch[1].trim()}` });
  }
  // Fill?
  const fillMatch = text.match(/(?:fill|enter|type)\s+(?:in\s+|into\s+)?[`"']?([^`"';.]+)[`"']?\s+(?:with|as|to)\s+[`"']?([^`"';.]+)[`"']?/i);
  if (fillMatch) {
    actions.push({
      type: "fill",
      selector: `input[name="${fillMatch[1].trim()}"], textarea[name="${fillMatch[1].trim()}"], [placeholder*="${fillMatch[1].trim()}" i]`,
      value: fillMatch[2].trim(),
    });
  }
  return actions.length > 0 ? actions : null;
}

function mapToolCallToBrowserAction(action: AgentAction): BrowserAction | null {
  if (action.type !== "tool_call" || !action.name || !action.args) return null;
  const a = action.args as Record<string, unknown>;
  switch (action.name) {
    case "browser_navigate":
      return a.url ? { type: "navigate", url: String(a.url) } : null;
    case "browser_click":
      return a.selector ? { type: "click", selector: String(a.selector) } : null;
    case "browser_fill":
      return a.selector
        ? { type: "fill", selector: String(a.selector), value: String(a.value ?? "") }
        : null;
    case "browser_type":
      return a.selector
        ? {
            type: "type",
            selector: String(a.selector),
            text: String(a.text ?? ""),
            delayMs: a.delayMs ? Number(a.delayMs) : undefined,
          }
        : null;
    case "browser_press":
      return a.key ? { type: "press", selector: a.selector ? String(a.selector) : undefined, key: String(a.key) } : null;
    case "browser_extract":
      return a.selector
        ? { type: "extract", selector: String(a.selector), attribute: a.attribute ? String(a.attribute) : "text" }
        : null;
    case "browser_wait":
      return {
        type: "wait",
        selector: a.selector ? String(a.selector) : undefined,
        ms: a.ms ? Number(a.ms) : undefined,
      };
    case "browser_screenshot":
      return { type: "screenshot", fullPage: Boolean(a.fullPage) };
    case "browser_scroll":
      return {
        type: "scroll",
        direction: a.direction === "up" ? "up" : "down",
        amount: a.amount ? Number(a.amount) : 400,
      };
    case "finish":
      return null; // handled by the loop, not a browser action
    default:
      return null;
  }
}

function* yieldBrowserResults(
  resp: Awaited<ReturnType<typeof executeBrowserActions>>
): Generator<AgentAction, void, void> {
  for (const r of resp.results) {
    if (r.ok) {
      yield { type: "tool_call", name: r.action.type, args: r.action as Record<string, unknown> };
    } else {
      yield { type: "thought", text: `✗ ${r.action.type} failed: ${r.error ?? "unknown"}` };
    }
  }
  if (resp.screenshot) {
    yield { type: "screenshot", screenshot: resp.screenshot, text: `Captured ${resp.url ?? "page"}` };
  }
  if (resp.error) {
    yield { type: "thought", text: `Browser executor error: ${resp.error}` };
  }
}

// Re-export the action result type for downstream consumers
export type { BrowserActionResult };
