import { NextRequest, NextResponse } from "next/server";
import { generateJson } from "@/lib/genai";
import {
  isGcpAvailable,
  publishRunEvent,
  writeDoc,
} from "@/lib/gcp";

/**
 * POST /api/agents/run-autonomous
 *
 * The headline "autonomous agent" entry point. Given a plain-English
 * goal, this route:
 *   1. Calls Gemini to compose a sub-task plan (re-uses the
 *      /api/agents/compose prompt)
 *   2. Picks a small batch of synthetic inputs
 *   3. Persists a `runs/{runId}` doc to Firestore with the composed
 *      plan embedded as `skill.steps`
 *   4. Publishes a `run.created` event to the `echo-runs` Pub/Sub
 *      topic so the Cloud Run worker picks it up
 *   5. Returns the runId so the composer can show progress
 *
 * The worker is where the actual autonomy lives: it loads the
 * `runEchoAgent` ADK loop from `src/lib/agents/echo-agent.ts`,
 * which uses Gemini to decide what browser actions to take and
 * drives the real headless Chromium via the `echo-browser` service.
 * The user doesn't schedule anything — they fire the agent, and
 * the agent does the rest on its own.
 *
 * Demo mode (no GCP): the run doc is still created in memory +
 * echoed back to the client so the UI can show progress; Pub/Sub
 * is skipped and the composer falls back to its local simulation.
 */

const COMPOSE_PROMPT = `You are Echo's Skill Manager — a meta-agent that composes complex workflows from a library of learned skills.

Given a user goal, decompose it into an ordered list of sub-tasks. For each sub-task say what it does and (crucially) what concrete browser actions are required (e.g. "navigate to https://mail.google.com", "click the Compose button", "fill the To field with the lead's email"). If you don't know the exact URL, use the public home page (e.g. https://www.linkedin.com, https://mail.google.com) — the agent will figure out the rest from the page.

Return ONLY valid JSON in this shape:
{
  "subtasks": [
    { "num": 1, "title": "Open HubSpot and pull this week's new leads", "matchedSkill": "HubSpot Lead Fetcher", "parallel": false, "estTime": "2m" },
    { "num": 2, "title": "For each lead, navigate to LinkedIn and enrich with title/company", "matchedSkill": "LinkedIn Lead Enricher", "parallel": true, "estTime": "5m" },
    { "num": 3, "title": "For each enriched lead, open Gmail, click Compose, fill in the lead's email + a personalized body, and save as draft", "matchedSkill": "Gmail Drafter", "parallel": true, "estTime": "8m" }
  ],
  "totalEstTime": "15m",
  "totalEstCost": "$0.42",
  "reasoning": "one sentence on why this decomposition"
}

Mark sub-tasks parallel: true when they're independent.`;

interface Subtask {
  num: number;
  title: string;
  matchedSkill: string;
  parallel: boolean;
  estTime: string;
}

interface Plan {
  subtasks: Subtask[];
  totalEstTime: string;
  totalEstCost: string;
  reasoning: string;
}

interface RunInput {
  id: string;
  payload: Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    goal?: string;
    inputCount?: number;
  };
  const goal = body.goal?.trim();
  if (!goal) {
    return NextResponse.json({ error: "goal is required" }, { status: 400 });
  }
  const inputCount = Math.max(1, Math.min(20, body.inputCount ?? 5));

  // 1) Compose the plan via Gemini (or fall back to a heuristic)
  const geminiResult = await generateJson({
    model: "gemini-3.5-flash",
    prompt: `${COMPOSE_PROMPT}\n\nGOAL: ${goal}`,
    temperature: 0.3,
  }).catch(() => null);

  let plan: Plan;
  if (geminiResult?.text) {
    try {
      const parsed = JSON.parse(geminiResult.text) as Partial<Plan>;
      plan = normalizePlan(parsed, goal);
    } catch {
      plan = heuristicPlan(goal);
    }
  } else {
    plan = heuristicPlan(goal);
  }

  // 2) Build a small batch of synthetic inputs from the goal
  const inputs: RunInput[] = buildInputsFromGoal(goal, inputCount);

  // 3) Persist the run doc + plan
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const agentId = isGcpAvailable()
    ? `agent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    : null;
  const skill = {
    suggestedName: plan.subtasks[0]?.matchedSkill ?? "Autonomous task",
    intent: plan.reasoning,
    steps: plan.subtasks.map((s) => ({
      num: s.num,
      title: s.title,
      detail: s.title, // the agent uses the title to drive the browser
      at: `00:${String(s.num * 5).padStart(2, "0")}`,
    })),
  };

  if (isGcpAvailable()) {
    await writeDoc("runs", runId, {
      runId,
      skillId: `autonomous_${Date.now()}`,
      agentId,
      goal,
      totalInputs: inputs.length,
      inputs,
      status: "queued",
      startedAt: new Date().toISOString(),
      skill,
      autonomous: true,
    }).catch(() => undefined);

    if (agentId) {
      await writeDoc("agents", agentId, {
        id: agentId,
        name: deriveAgentName(goal),
        goal,
        subtasks: plan.subtasks,
        totalEstTime: plan.totalEstTime,
        totalEstCost: plan.totalEstCost,
        reasoning: plan.reasoning,
        status: "active",
        createdAt: new Date().toISOString(),
      }).catch(() => undefined);
    }

    // 4) Publish run.created so the Cloud Run worker picks it up
    await publishRunEvent({
      eventType: "run.created",
      runId,
      skillId: "autonomous",
      totalInputs: inputs.length,
      autonomous: true,
      createdAt: new Date().toISOString(),
    }).catch(() => undefined);
  }

  return NextResponse.json({
    ok: true,
    runId,
    agentId,
    plan,
    inputs: inputs.length,
    goal,
    skill,
    gcp: isGcpAvailable() ? "connected" : "disabled",
    message: isGcpAvailable()
      ? "Autonomous agent dispatched. The Cloud Run worker will pick it up and drive the headless browser."
      : `Autonomous agent dispatched (demo mode). ${inputs.length} input(s) will be processed in the background.`,
  });
}

// ---------- Helpers ----------

function normalizePlan(parsed: Partial<Plan>, goal: string): Plan {
  const subtasks: Subtask[] = Array.isArray(parsed.subtasks) && parsed.subtasks.length > 0
    ? parsed.subtasks.map((s, i) => ({
        num: typeof s?.num === "number" ? s.num : i + 1,
        title: String(s?.title ?? `Step ${i + 1}`),
        matchedSkill: String(s?.matchedSkill ?? "Autonomous step"),
        parallel: Boolean(s?.parallel),
        estTime: String(s?.estTime ?? "5m"),
      }))
    : heuristicPlan(goal).subtasks;
  return {
    subtasks,
    totalEstTime: parsed.totalEstTime ?? "10m",
    totalEstCost: parsed.totalEstCost ?? "$0.18",
    reasoning: parsed.reasoning ?? `Echo broke your goal into ${subtasks.length} sub-tasks.`,
  };
}

function heuristicPlan(goal: string): Plan {
  const lower = goal.toLowerCase();
  const subtasks: Subtask[] = [];
  let n = 1;
  const push = (s: Omit<Subtask, "num">) => subtasks.push({ num: n++, ...s });

  if (lower.includes("hubspot") || lower.includes("lead")) {
    push({ title: "Open HubSpot and pull this week's new leads", matchedSkill: "HubSpot Lead Fetcher", parallel: false, estTime: "2m" });
  }
  if (lower.includes("linkedin") || lower.includes("enrich")) {
    push({ title: "For each lead, navigate to LinkedIn and enrich with title/company", matchedSkill: "LinkedIn Lead Enricher", parallel: true, estTime: "5m" });
  }
  if (lower.includes("email") || lower.includes("outreach") || lower.includes("gmail") || lower.includes("draft")) {
    push({ title: "For each enriched lead, open Gmail, click Compose, fill in the lead's email + a personalized body, and save as draft", matchedSkill: "Gmail Drafter", parallel: true, estTime: "8m" });
  }
  if (lower.includes("slack") || lower.includes("notify") || lower.includes("alert")) {
    push({ title: "Post a summary of new drafts to #sales on Slack", matchedSkill: "Slack Notifier", parallel: false, estTime: "1m" });
  }
  if (subtasks.length === 0) {
    push({ title: "Navigate to the public home page of the relevant service", matchedSkill: "Web Navigator", parallel: false, estTime: "1m" });
    push({ title: "Read the on-page instructions to figure out the next step", matchedSkill: "Page Reader", parallel: false, estTime: "2m" });
    push({ title: "Perform the workflow described in the goal", matchedSkill: "Generic Workflow", parallel: false, estTime: "5m" });
    push({ title: "Save the result and report back", matchedSkill: "Result Logger", parallel: false, estTime: "1m" });
  }
  return {
    subtasks,
    totalEstTime: "10m",
    totalEstCost: "$0.18",
    reasoning: `Echo broke your goal into ${subtasks.length} sub-tasks. The agent will drive a real headless browser to do each one.`,
  };
}

function buildInputsFromGoal(goal: string, n: number): RunInput[] {
  const lower = goal.toLowerCase();
  const sample: Record<string, unknown> = {};
  if (lower.includes("lead") || lower.includes("hubspot")) {
    sample.firstName = "Sample";
    sample.lastName = "Lead";
    sample.email = "sample.lead@example.com";
    sample.company = "Acme Inc";
  } else {
    sample.url = "https://www.example.com";
  }
  return Array.from({ length: n }, (_, i) => ({
    id: `input_${i + 1}`,
    payload: { ...sample, index: i + 1 },
  }));
}

function deriveAgentName(g: string): string {
  const first = g.split(/[.!?\n]/)[0].trim();
  const words = first.split(/\s+/).slice(0, 6).join(" ");
  return words.length > 50 ? words.slice(0, 47) + "..." : words || "Autonomous agent";
}
