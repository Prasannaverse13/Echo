"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";
import {
  appendLog,
  getUserId,
  listSkills,
  type SkillRecord,
} from "@/lib/client/stores";
import { downloadSkillFromSaved, downloadSkillFromRecordSmart } from "@/lib/client/skill-md";

type Step = { num: number; title: string; detail: string; at?: string };

type RichSkill = {
  name: string;
  description: string;
  color: "dusty-sky" | "wisteria" | "desert-clay" | "mist-mint";
  intent: string;
  trigger: string;
  steps: Step[];
  integrations: string[];
  stats?: { label: string; value: string }[];
  runHistory?: {
    id: string;
    input: string;
    status: "success" | "failed" | "review";
    duration: string;
    when: string;
  }[];
  source?: "demo" | "manual" | "recorder" | "composer" | "seed";
};

const skillData: Record<string, RichSkill> = {
  "rfp-response": {
    name: "RFP Response Drafting",
    description: "Reads RFP PDFs and drafts answers from your knowledge vault.",
    color: "dusty-sky",
    intent:
      "When an RFP PDF arrives in Drive/RFPs, read every question, search the knowledge vault for matching content, and draft a complete response document with citations.",
    trigger: "New file in Drive/RFPs",
    steps: [
      { num: 1, title: "Detect new RFP", detail: "Watch Drive/RFPs folder for new PDF uploads." },
      { num: 2, title: "Extract questions", detail: "Read PDF, identify all questions (numbered, bulleted, or section headers)." },
      { num: 3, title: "Search knowledge vault", detail: "For each question, semantically search the vault (past RFPs, case studies, product docs)." },
      { num: 4, title: "Draft responses", detail: "Generate a response for each question with inline citations to source docs." },
      { num: 5, title: "Flag for review", detail: "Mark questions with low-confidence matches as 'needs human review' before saving." },
    ],
    integrations: ["Drive", "Gmail", "Sheets", "Slack"],
    stats: [
      { label: "Total runs", value: "47" },
      { label: "Success rate", value: "95.7%" },
      { label: "Avg duration", value: "4m 12s" },
      { label: "Avg time saved", value: "12h/run" },
    ],
    runHistory: [
      { id: "run_2401", input: "Acme Corp RFP Q3.pdf", status: "success", duration: "3m 42s", when: "2h ago" },
      { id: "run_2400", input: "Globex Industries RFI.pdf", status: "success", duration: "5m 11s", when: "1d ago" },
      { id: "run_2399", input: "Initech Security Audit.pdf", status: "review", duration: "4m 30s", when: "1d ago" },
      { id: "run_2398", input: "scanned-form-2024.pdf", status: "failed", duration: "0m 8s", when: "2d ago" },
      { id: "run_2397", input: "Stark Industries RFP.pdf", status: "success", duration: "4m 02s", when: "3d ago" },
    ],
  },
  "inbox-triage": {
    name: "Inbox Triage",
    description: "Sorts, drafts replies, schedules meetings from your inbox.",
    color: "wisteria",
    intent:
      "Every 15 minutes, scan unread email, classify each message (urgent / FYI / meeting request / spam), draft a reply where appropriate, and surface only what truly needs the user's eyes.",
    trigger: "Every 15 min / New email",
    steps: [
      { num: 1, title: "Pull unread mail", detail: "List unread threads from the last 15 minutes via the Gmail API." },
      { num: 2, title: "Classify intent", detail: "For each thread, decide between urgent / FYI / meeting / spam using the user's last 30 days of similar labels." },
      { num: 3, title: "Draft replies", detail: "Generate a short, on-tone reply draft for every actionable message and save as a Gmail draft (not sent)." },
      { num: 4, title: "Schedule meetings", detail: "When a thread looks like a meeting request, propose 3 free slots from Calendar and embed them in the draft." },
      { num: 5, title: "Surface only the urgent", detail: "Push only the urgent-and-needs-decision threads to Echo; archive the rest silently." },
    ],
    integrations: ["Gmail", "Calendar"],
    stats: [
      { label: "Total runs", value: "124" },
      { label: "Success rate", value: "98.4%" },
      { label: "Avg duration", value: "0m 22s" },
      { label: "Avg time saved", value: "38m/run" },
    ],
    runHistory: [
      { id: "run_3820", input: "47 unread threads", status: "success", duration: "0m 18s", when: "5m ago" },
      { id: "run_3819", input: "23 unread threads", status: "success", duration: "0m 14s", when: "20m ago" },
      { id: "run_3818", input: "12 unread threads", status: "success", duration: "0m 11s", when: "35m ago" },
      { id: "run_3817", input: "64 unread threads", status: "review", duration: "0m 31s", when: "1h ago" },
      { id: "run_3816", input: "8 unread threads", status: "success", duration: "0m 09s", when: "1h ago" },
    ],
  },
  "pdf-sheets": {
    name: "PDF → Sheets",
    description: "Extracts tabular data from PDFs into Google Sheets rows.",
    color: "desert-clay",
    intent:
      "When a PDF lands in Drive/Invoices, detect any tables, convert them to structured rows, and append to the matching Google Sheet with column mapping preserved.",
    trigger: "New PDF in Drive/Invoices",
    steps: [
      { num: 1, title: "Watch Drive folder", detail: "Poll Drive/Invoices for new PDFs every 60s." },
      { num: 2, title: "Locate tables", detail: "Use Gemini Vision to scan each page and locate any tabular data regions." },
      { num: 3, title: "Extract rows", detail: "For each table, return rows as structured JSON with column headers preserved." },
      { num: 4, title: "Map columns", detail: "Match the PDF's column names to existing Sheet headers (fuzzy match) and flag any unknown columns." },
      { num: 5, title: "Append to Sheet", detail: "Append extracted rows to the bottom of the target sheet, leaving existing data intact." },
    ],
    integrations: ["Drive", "Sheets"],
    stats: [
      { label: "Total runs", value: "32" },
      { label: "Success rate", value: "100%" },
      { label: "Avg duration", value: "1m 48s" },
      { label: "Avg time saved", value: "22m/run" },
    ],
    runHistory: [
      { id: "run_2010", input: "Invoice_Stark_Aug.pdf", status: "success", duration: "1m 22s", when: "1d ago" },
      { id: "run_2009", input: "Invoice_Acme_Jul.pdf", status: "success", duration: "2m 04s", when: "4d ago" },
      { id: "run_2008", input: "Invoice_Globex_Jul.pdf", status: "success", duration: "1m 55s", when: "1w ago" },
      { id: "run_2007", input: "Invoice_Initech_Jul.pdf", status: "success", duration: "1m 38s", when: "1w ago" },
      { id: "run_2006", input: "Invoice_Tyrell_Jul.pdf", status: "success", duration: "2m 11s", when: "2w ago" },
    ],
  },
  "weekly-report": {
    name: "Weekly Report Generator",
    description: "Pulls metrics, drafts a summary, posts to Slack.",
    color: "mist-mint",
    intent:
      "Every Monday at 9am, pull last week's metrics from Sheets, draft a short summary with the headline wins and 3 things to watch, and post to the #team channel.",
    trigger: "Schedule · Mon 9am",
    steps: [
      { num: 1, title: "Schedule trigger", detail: "Cloud Scheduler fires the skill at 09:00 IST every Monday." },
      { num: 2, title: "Pull weekly metrics", detail: "Read this week's rows from Sheets/Metrics and compute deltas vs the prior week." },
      { num: 3, title: "Identify highlights", detail: "Rank rows by absolute change and pick the top 3 wins + top 3 dips." },
      { num: 4, title: "Draft summary", detail: "Write a 5-line summary in the user's last-used voice (concise, second-person)." },
      { num: 5, title: "Post to Slack", detail: "Send the summary to #team with thread replies pre-drafted for each highlight." },
    ],
    integrations: ["Sheets", "Slack"],
    stats: [
      { label: "Total runs", value: "8" },
      { label: "Success rate", value: "100%" },
      { label: "Avg duration", value: "0m 54s" },
      { label: "Avg time saved", value: "45m/run" },
    ],
    runHistory: [
      { id: "run_0090", input: "Week of Aug 18", status: "success", duration: "0m 48s", when: "4d ago" },
      { id: "run_0089", input: "Week of Aug 11", status: "success", duration: "0m 52s", when: "11d ago" },
      { id: "run_0088", input: "Week of Aug 04", status: "success", duration: "0m 58s", when: "18d ago" },
      { id: "run_0087", input: "Week of Jul 28", status: "success", duration: "1m 02s", when: "25d ago" },
    ],
  },
  "lead-enricher": {
    name: "LinkedIn Lead Enricher",
    description: "Enriches HubSpot leads with LinkedIn data and writes notes.",
    color: "dusty-sky",
    intent:
      "When HubSpot fires the 'new-lead' webhook, fetch the lead's LinkedIn profile (or company page if personal isn't public), summarize 2-3 talking points, and append them as a note on the HubSpot contact.",
    trigger: "Webhook from HubSpot",
    steps: [
      { num: 1, title: "Receive webhook", detail: "Cloud Run endpoint accepts HubSpot's new-lead POST and enqueues a task." },
      { num: 2, title: "Resolve LinkedIn", detail: "Search LinkedIn for the lead by name + company; prefer personal profile, fall back to company page." },
      { num: 3, title: "Extract highlights", detail: "From the public profile, pull current role, recent posts, mutual connections, and shared groups." },
      { num: 4, title: "Write HubSpot note", detail: "Append a 3-line note to the contact with the highlights and 1 suggested opener line." },
      { num: 5, title: "Notify rep", detail: "DM the assigned rep in Slack with the note + a 'mark as enriched' button." },
    ],
    integrations: ["HubSpot", "LinkedIn"],
    stats: [
      { label: "Total runs", value: "156" },
      { label: "Success rate", value: "92.3%" },
      { label: "Avg duration", value: "0m 31s" },
      { label: "Avg time saved", value: "8m/run" },
    ],
    runHistory: [
      { id: "run_4401", input: "jane.doe@acme.com", status: "success", duration: "0m 24s", when: "12m ago" },
      { id: "run_4400", input: "mark.smith@globex.io", status: "review", duration: "0m 41s", when: "1h ago" },
      { id: "run_4399", input: "lisa@initech.com", status: "success", duration: "0m 28s", when: "2h ago" },
      { id: "run_4398", input: "peter.g@stark.co", status: "success", duration: "0m 22s", when: "3h ago" },
      { id: "run_4397", input: "anon@unknown.com", status: "failed", duration: "0m 06s", when: "4h ago" },
    ],
  },
  "social-scheduler": {
    name: "Social Media Scheduler",
    description: "Reformats blog posts into platform-specific social copy.",
    color: "wisteria",
    intent:
      "When a new post is published in Ghost, generate 3 platform-tuned variants (LinkedIn, Twitter/X, Threads) with appropriate length and hook placement, and queue them in Buffer for the next 9am slot.",
    trigger: "New post in Ghost",
    steps: [
      { num: 1, title: "Watch Ghost", detail: "Ghost webhook fires on 'post.published'." },
      { num: 2, title: "Read post", detail: "Fetch the post HTML, strip tags, and extract the first 200 chars for hook generation." },
      { num: 3, title: "Generate variants", detail: "Produce 3 distinct variants tuned to each platform's voice and length (LinkedIn 220-280ch, Twitter 240ch thread, Threads 400ch)." },
      { num: 4, title: "Add hashtags", detail: "Append 2-3 niche hashtags from a per-platform tag bank; never invent tags." },
      { num: 5, title: "Queue in Buffer", detail: "Push the 3 variants to Buffer with the next 9am publish slot; tag the post in Buffer for tracking." },
    ],
    integrations: ["Ghost", "Twitter", "LinkedIn"],
    stats: [
      { label: "Total runs", value: "23" },
      { label: "Success rate", value: "100%" },
      { label: "Avg duration", value: "0m 47s" },
      { label: "Avg time saved", value: "18m/run" },
    ],
    runHistory: [
      { id: "run_1201", input: "Why Taskmasters beat workflow tools", status: "success", duration: "0m 39s", when: "3d ago" },
      { id: "run_1200", input: "From demo to production: lessons from Gemini 3.5", status: "success", duration: "0m 51s", when: "1w ago" },
      { id: "run_1199", input: "Composing skills: the 11x playbook", status: "success", duration: "0m 44s", when: "2w ago" },
      { id: "run_1198", input: "Why ADK + Gemini is the right bet", status: "success", duration: "0m 50s", when: "3w ago" },
    ],
  },
};

function fromLocalStorage(s: SkillRecord): RichSkill {
  return {
    name: s.name,
    description: s.description,
    color: s.color,
    intent:
      (s as unknown as { intent?: string }).intent ||
      `${s.name}: ${s.description}. Created from a screen recording on ${new Date(s.createdAt).toLocaleString()}.`,
    trigger: s.trigger || "Manual",
    steps: (s.steps || []).map((st) => ({
      num: st.num,
      title: st.title,
      detail: st.detail,
      at: st.at,
    })),
    integrations: (s as unknown as { integrations?: string[] }).integrations || [],
    source: s.source,
    stats: [
      { label: "Status", value: "Ready" },
      { label: "Source", value: s.source === "recorder" ? "Screen capture" : s.source === "manual" ? "Typed" : s.source === "composer" ? "Composed" : "Demo" },
      { label: "Created", value: new Date(s.createdAt).toLocaleDateString() },
      { label: "Steps", value: String((s.steps || []).length) },
    ],
    runHistory: [],
  };
}

/**
 * Synthesize a `SkillRecord` from a hardcoded `RichSkill` so the
 * download button can fire for demo seeds too. The synthesized
 * record is never written back to localStorage — it lives only in
 * component state for the duration of the page visit.
 */
function richSkillToRecord(s: RichSkill, id: string): SkillRecord {
  return {
    id,
    name: s.name,
    description: s.description,
    color: s.color,
    trigger: s.trigger,
    steps: s.steps.map((st) => ({
      num: st.num,
      title: st.title,
      detail: st.detail,
      at: st.at ?? "",
    })),
    createdAt: new Date().toISOString(),
    source:
      s.source === "recorder"
        ? "recorder"
        : s.source === "manual"
          ? "manual"
          : s.source === "composer"
            ? "composer"
            : "seed",
    intent: s.intent,
    triggers: undefined,
    integrations: s.integrations,
  };
}

export default function SkillDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "found"; skill: RichSkill; record: SkillRecord }
    | { kind: "notfound" }
  >({ kind: "loading" });

  useEffect(() => {
    if (!id) {
      setState({ kind: "notfound" });
      return;
    }
    // 1) hardcoded demo skills
    if (skillData[id]) {
      const rich = skillData[id];
      setState({
        kind: "found",
        skill: rich,
        record: richSkillToRecord(rich, id),
      });
      return;
    }
    // 2) user-created skills in localStorage
    try {
      const userId = getUserIdFromSession();
      const all = listSkills(userId);
      const found = all.find((s) => s.id === id);
      if (found) {
        setState({ kind: "found", skill: fromLocalStorage(found), record: found });
        return;
      }
    } catch {
      // ignore
    }
    setState({ kind: "notfound" });
  }, [id]);

  if (state.kind === "loading") {
    return (
      <div className="page-container py-20 text-center text-obsidian/60">
        Loading…
      </div>
    );
  }

  if (state.kind === "notfound") {
    return (
      <div className="page-container py-20">
        <div className="max-w-md mx-auto text-center">
          <p className="text-display-md font-bold mb-3">Skill not found</p>
          <p className="text-body text-obsidian/70 mb-6">
            This skill may have been deleted, or it was created in another session.
          </p>
          <Link
            href="/skills"
            className="inline-block px-4 py-2 rounded-lg bg-obsidian text-paper-white text-body-sm font-medium hover:bg-obsidian/90"
          >
            ← Back to Skills
          </Link>
        </div>
      </div>
    );
  }

  const skill = state.skill;

  return (
    <div className="page-container py-10">
      <Link
        href="/skills"
        className="text-caption text-obsidian/60 hover:text-obsidian mb-6 inline-block"
      >
        ← Back to skills
      </Link>

      {/* Hero */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-10">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <FeatureTag variant="obsidian">Skill</FeatureTag>
            <FeatureTag variant="iron">
              {skill.source === "recorder"
                ? "From screen capture"
                : skill.source === "manual"
                  ? "Manual"
                  : skill.source === "composer"
                    ? "Composed"
                    : skill.source === "seed"
                      ? "Demo"
                      : "Demo"}
            </FeatureTag>
            <FeatureTag variant="mist-mint">Healthy</FeatureTag>
          </div>
          <h1 className="text-display-md font-bold">{skill.name}</h1>
          <p className="mt-3 text-body text-obsidian/70 max-w-2xl">
            {skill.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Link href="/record">
            <Button variant="outline-light" size="md">
              ✎ Record
            </Button>
          </Link>
          <Button
            variant="outline-light"
            size="md"
            onClick={() => {
              try {
                // Smart router: prefer the new BuiltSkill format if the
                // record has one; fall back to the legacy RecordedSkill
                // generator for backfilled / pre-pipeline skills.
                downloadSkillFromRecordSmart(state.record as Parameters<typeof downloadSkillFromRecordSmart>[0]);
                appendLog(getUserId(), {
                  level: "info",
                  agent: "echo-skills",
                  msg: `Exported skill.md for "${state.skill.name}" (${state.record.source})`,
                });
              } catch (err) {
                appendLog(getUserId(), {
                  level: "error",
                  agent: "echo-skills",
                  msg: `Failed to export skill.md for "${state.skill.name}": ${err instanceof Error ? err.message : String(err)}`,
                });
              }
            }}
            title="Download a portable skill.md with the procedure, rules, output schema, and validation"
          >
            ↓ Download .md
          </Button>
          <Link href="/compose">
            <Button variant="light" size="md">
              ▶ Compose
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      {skill.stats && skill.stats.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          {skill.stats.map((stat) => (
            <FeatureCard
              key={stat.label}
              surface="paper-white"
              padding="md"
              className="hairline"
            >
              <p className="text-caption text-obsidian/50 mb-1">{stat.label}</p>
              <p className="text-heading-sm font-bold tabular-nums">
                {stat.value}
              </p>
            </FeatureCard>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Intent + Steps */}
        <div className="lg:col-span-2 space-y-6">
          <FeatureCard surface="sandstone" padding="lg">
            <p className="text-caption font-medium uppercase opacity-60 mb-2">
              Intent
            </p>
            <p className="text-body leading-relaxed">{skill.intent}</p>
          </FeatureCard>

          <div>
            <h2 className="text-heading-sm font-bold mb-4">
              {skill.source === "recorder" ? "Reconstructed steps" : "Steps"}
            </h2>
            <div className="space-y-3">
              {skill.steps.map((step) => (
                <FeatureCard
                  key={step.num}
                  surface="paper-white"
                  padding="md"
                  className="hairline"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-obsidian text-paper-white flex items-center justify-center font-bold">
                      {step.num}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-body font-bold mb-1">{step.title}</h3>
                        {step.at && (
                          <span className="text-caption text-obsidian/50 tabular-nums">
                            {step.at}
                          </span>
                        )}
                      </div>
                      <p className="text-body-sm text-obsidian/70">
                        {step.detail}
                      </p>
                    </div>
                  </div>
                </FeatureCard>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <FeatureCard surface="paper-white" padding="md" className="hairline">
            <h3 className="text-caption font-medium uppercase opacity-60 mb-3">
              Trigger
            </h3>
            <p className="text-body-sm font-medium">{skill.trigger}</p>
          </FeatureCard>

          {skill.integrations.length > 0 && (
            <FeatureCard surface="paper-white" padding="md" className="hairline">
              <h3 className="text-caption font-medium uppercase opacity-60 mb-3">
                Integrations
              </h3>
              <div className="flex flex-wrap gap-2">
                {skill.integrations.map((i) => (
                  <FeatureTag key={i} variant="iron">
                    {i}
                  </FeatureTag>
                ))}
              </div>
            </FeatureCard>
          )}

          <FeatureCard surface="wisteria" padding="md">
            <h3 className="text-caption font-medium uppercase opacity-60 mb-2">
              Next step
            </h3>
            <p className="text-body-sm">
              Open the Composer to bind this skill to a trigger, connect it to your
              real integrations, and run it on production inputs.
            </p>
            <Link href="/compose" className="block mt-3">
              <Button variant="light" size="sm" className="w-full">
                → Open Composer
              </Button>
            </Link>
          </FeatureCard>
        </div>
      </div>

      {/* Run history — only for skills that have one */}
      {skill.runHistory && skill.runHistory.length > 0 && (
        <div className="mt-12">
          <h2 className="text-heading-sm font-bold mb-4">Run history</h2>
          <FeatureCard surface="paper-white" padding="md" className="hairline overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-iron">
                  <th className="text-caption font-medium uppercase opacity-60 py-3">Run</th>
                  <th className="text-caption font-medium uppercase opacity-60 py-3">Input</th>
                  <th className="text-caption font-medium uppercase opacity-60 py-3">Status</th>
                  <th className="text-caption font-medium uppercase opacity-60 py-3">Duration</th>
                  <th className="text-caption font-medium uppercase opacity-60 py-3">When</th>
                </tr>
              </thead>
              <tbody>
                {skill.runHistory.map((run) => (
                  <tr key={run.id} className="border-b border-iron last:border-0">
                    <td className="py-3 text-caption font-mono">{run.id}</td>
                    <td className="py-3 text-body-sm">{run.input}</td>
                    <td className="py-3">
                      <FeatureTag
                        variant={
                          run.status === "success"
                            ? "mist-mint"
                            : run.status === "review"
                              ? "desert-clay"
                              : "iron"
                        }
                      >
                        {run.status}
                      </FeatureTag>
                    </td>
                    <td className="py-3 text-body-sm tabular-nums">{run.duration}</td>
                    <td className="py-3 text-caption text-obsidian/60">{run.when}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </FeatureCard>
        </div>
      )}
    </div>
  );
}

function getUserIdFromSession(): string {
  if (typeof window === "undefined") return "anon";
  try {
    const session = window.localStorage.getItem("echo.session");
    if (session) {
      const parsed = JSON.parse(session);
      if (parsed?.email) return parsed.email;
    }
  } catch {
    /* ignore */
  }
  return "anon";
}
