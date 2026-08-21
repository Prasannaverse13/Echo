import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

/**
 * POST /api/agents/compose
 *
 * The Skill Manager. Takes a natural-language goal and returns:
 *   - Sub-tasks it would break the goal into
 *   - Existing skills from the library that match
 *   - An orchestrator plan
 *   - Estimated time & cost
 *
 * This is the headline "auto-compose" feature.
 */

interface ComposeRequest {
  goal: string;
  library?: Array<{ id: string; name: string; description: string }>;
}

interface SubTask {
  num: number;
  title: string;
  matchedSkill: string;
  parallel: boolean;
  estTime: string;
}

const COMPOSE_PROMPT = `You are Echo's Skill Manager — a meta-agent that composes complex workflows from a library of learned skills.

Given a user goal and the available skill library, decompose the goal into an ordered list of sub-tasks, and assign an existing skill to each sub-task. If no skill matches, suggest what new skill to record.

Return ONLY valid JSON in this shape:
{
  "subtasks": [
    { "num": 1, "title": "What this sub-task does", "matchedSkill": "exact skill name from library (or 'NEW: <description>' if no match)", "parallel": false, "estTime": "5m" }
  ],
  "totalEstTime": "12m",
  "totalEstCost": "$0.42",
  "reasoning": "one sentence on why this decomposition"
}

Use realistic time estimates. Mark steps as parallel: true when they're independent and can run concurrently.`;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as ComposeRequest;
  if (!body.goal) {
    return NextResponse.json({ error: "goal is required" }, { status: 400 });
  }

  const library = body.library ?? [
    { id: "hubspot-fetcher", name: "HubSpot Lead Fetcher", description: "Fetches new leads from HubSpot" },
    { id: "linkedin-enricher", name: "LinkedIn Lead Enricher", description: "Enriches contacts with LinkedIn data" },
    { id: "email-drafter", name: "Personalized Email Drafter", description: "Drafts personalized outreach emails" },
    { id: "gmail-drafter", name: "Gmail Drafter", description: "Saves drafts to Gmail drafts folder" },
    { id: "inbox-triage", name: "Inbox Triage", description: "Sorts and replies to inbox" },
    { id: "csv-cleanup", name: "CSV Cleanup", description: "Cleans and dedupes CSV files" },
    { id: "weekly-report", name: "Weekly Report Generator", description: "Generates weekly summary report" },
    { id: "slack-notifier", name: "Slack Notifier", description: "Posts notifications to Slack" },
  ];

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const genai = new GoogleGenAI({ apiKey });
      const response = await genai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `${COMPOSE_PROMPT}\n\nGOAL: ${body.goal}\n\nSKILL LIBRARY:\n${library.map((s) => `- ${s.name}: ${s.description}`).join("\n")}`,
              },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0.3,
        },
      });

      const text = response.text ?? "{}";
      const parsed = JSON.parse(text);
      return NextResponse.json({ ok: true, source: "gemini", ...parsed });
    } catch (err) {
      console.error("[compose] Gemini call failed, falling back to mock:", err);
    }
  }

  // Heuristic fallback that infers a reasonable plan from keywords
  const lower = body.goal.toLowerCase();
  const subtasks: SubTask[] = [];
  let num = 1;

  if (lower.includes("hubspot") || lower.includes("lead")) {
    subtasks.push({
      num: num++,
      title: "Fetch new leads from HubSpot",
      matchedSkill: "HubSpot Lead Fetcher",
      parallel: false,
      estTime: "2m",
    });
  }
  if (lower.includes("linkedin") || lower.includes("enrich")) {
    subtasks.push({
      num: num++,
      title: "Enrich each lead with LinkedIn data (in parallel)",
      matchedSkill: "LinkedIn Lead Enricher",
      parallel: true,
      estTime: "5m",
    });
  }
  if (lower.includes("email") || lower.includes("outreach") || lower.includes("draft")) {
    subtasks.push({
      num: num++,
      title: "Draft personalized outreach email (in parallel)",
      matchedSkill: "Personalized Email Drafter",
      parallel: true,
      estTime: "8m",
    });
  }
  if (lower.includes("gmail") || lower.includes("drafts folder")) {
    subtasks.push({
      num: num++,
      title: "Save drafts to Gmail drafts folder",
      matchedSkill: "Gmail Drafter",
      parallel: false,
      estTime: "1m",
    });
  }
  if (lower.includes("slack") || lower.includes("notify")) {
    subtasks.push({
      num: num++,
      title: "Notify the team via Slack",
      matchedSkill: "Slack Notifier",
      parallel: false,
      estTime: "1m",
    });
  }

  // Default fallback if nothing matched
  if (subtasks.length === 0) {
    subtasks.push(
      {
        num: 1,
        title: "Parse goal and identify required data sources",
        matchedSkill: "NEW: Goal Analyzer",
        parallel: false,
        estTime: "1m",
      },
      {
        num: 2,
        title: "Execute the workflow",
        matchedSkill: "NEW: Generic Executor",
        parallel: false,
        estTime: "10m",
      },
      {
        num: 3,
        title: "Save results and notify",
        matchedSkill: "Slack Notifier",
        parallel: false,
        estTime: "1m",
      }
    );
  }

  // Simulate a tiny bit of latency
  await new Promise((r) => setTimeout(r, 600));

  return NextResponse.json({
    ok: true,
    source: "mock",
    subtasks,
    totalEstTime: "12m",
    totalEstCost: "$0.42",
    reasoning: `Echo broke your goal into ${subtasks.length} sub-tasks, matching ${subtasks.filter((s) => !s.matchedSkill.startsWith("NEW:")).length} to existing skills in your library.`,
  });
}
