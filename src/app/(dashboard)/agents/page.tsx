"use client";

/**
 * Agents list page.
 *
 * Shows both the hardcoded demo seeds (kept for the marketing
 * screenshots) AND any agents the user has actually saved via the
 * composer dispatch flow. Saved agents read from
 * `echo.${userId}.agents` (the same store the composer's dispatch
 * writes to); seeds are static fallback.
 */

import * as React from "react";
import Link from "next/link";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";
import { buildAgentsTools } from "@/lib/webmcp/agents-tools";
import { useWebMCPTools } from "@/lib/webmcp/use-webmcp";
import { getUserId, listAgents, listRuns, type AgentRecord, type RunRecord } from "@/lib/client/stores";

interface SeedAgent {
  id: string;
  name: string;
  goal: string;
  parent: string;
  skills: string[];
  progress: number;
  total: number;
  status: "running" | "completed" | "review" | "failed";
  eta: string;
  spawnedAt: string;
}

const seedAgents: SeedAgent[] = [
  {
    id: "rfp-responder",
    name: "RFP Responder",
    goal: "Process 1,000 incoming RFPs and draft responses.",
    parent: "Auto-composed",
    skills: ["RFP Response Drafting", "Slack Notifier"],
    progress: 234,
    total: 1000,
    status: "running",
    eta: "~14h",
    spawnedAt: "Aug 21, 09:14",
  },
  {
    id: "inbox-butler",
    name: "Inbox Butler",
    goal: "Triage and respond to today's inbox.",
    parent: "Manual · Schedule",
    skills: ["Inbox Triage", "Calendar Scheduler", "CRM Update"],
    progress: 47,
    total: 47,
    status: "completed",
    eta: "Done",
    spawnedAt: "Aug 21, 08:00",
  },
  {
    id: "lead-enricher",
    name: "Lead Enricher",
    goal: "Enrich 200 HubSpot leads with LinkedIn data.",
    parent: "Trigger · HubSpot webhook",
    skills: ["LinkedIn Lead Enricher", "Sheets Logger"],
    progress: 12,
    total: 200,
    status: "running",
    eta: "~3h",
    spawnedAt: "Aug 21, 11:42",
  },
  {
    id: "weekly-reporter",
    name: "Weekly Reporter",
    goal: "Compile metrics, draft summary, post to Slack.",
    parent: "Schedule · Mon 9am",
    skills: ["Weekly Report Generator"],
    progress: 1,
    total: 1,
    status: "running",
    eta: "~2m",
    spawnedAt: "Aug 21, 09:00",
  },
  {
    id: "social-amplifier",
    name: "Social Amplifier",
    goal: "Reformat this week's blog posts for social.",
    parent: "Manual · On-demand",
    skills: ["Social Media Scheduler"],
    progress: 8,
    total: 23,
    status: "review",
    eta: "Needs you",
    spawnedAt: "Aug 20, 14:22",
  },
  {
    id: "csv-cleaner",
    name: "CSV Cleaner",
    goal: "Standardize and dedupe 500 CSVs.",
    parent: "Manual · On-demand",
    skills: ["CSV Cleanup"],
    progress: 500,
    total: 500,
    status: "completed",
    eta: "Done",
    spawnedAt: "Aug 20, 10:00",
  },
];

const statusMeta: Record<string, { color: "dusty-sky" | "wisteria" | "desert-clay" | "mist-mint" | "iron"; label: string; symbol: string }> = {
  running: { color: "desert-clay", label: "Running", symbol: "◉" },
  completed: { color: "mist-mint", label: "Done", symbol: "✓" },
  review: { color: "wisteria", label: "Needs you", symbol: "!" },
  failed: { color: "iron", label: "Failed", symbol: "✕" },
  paused: { color: "iron", label: "Paused", symbol: "⏸" },
  planning: { color: "dusty-sky", label: "Planning", symbol: "⟳" },
  active: { color: "desert-clay", label: "Active", symbol: "◉" },
  archived: { color: "iron", label: "Archived", symbol: "▣" },
};

interface UnifiedAgent {
  id: string;
  name: string;
  goal: string;
  parent: string;
  skills: string[];
  progress: number;
  total: number;
  status: string;
  eta: string;
  spawnedAt: string;
  isSeed: boolean;
}

function toUnified(record: AgentRecord, runs: RunRecord[]): UnifiedAgent {
  const linkedRuns = runs.filter((r) => r.agentId === record.id);
  const completed = linkedRuns.filter((r) => r.status === "completed").length;
  const totalInputs = linkedRuns.reduce((s, r) => s + (r.totalInputs ?? 0), 0);
  const totalDone = linkedRuns.reduce((s, r) => s + Math.floor((r.progress ?? 0) / 100 * (r.totalInputs ?? 0)), 0);
  return {
    id: record.id,
    name: record.name,
    goal: record.goal,
    parent: "Auto-composed",
    skills: record.subtasks?.map((s) => s.matchedSkill).filter(Boolean) ?? [],
    progress: totalDone,
    total: Math.max(linkedRuns.length, 1),
    status: record.status,
    eta: linkedRuns.length > 0 ? `${linkedRuns.length} run${linkedRuns.length === 1 ? "" : "s"}` : "Not started",
    spawnedAt: new Date(record.createdAt).toLocaleString(),
    isSeed: false,
  };
}

function toUnifiedSeed(seed: SeedAgent): UnifiedAgent {
  return { ...seed, isSeed: true };
}

export default function AgentsPage() {
  const userId = React.useMemo(getUserId, []);
  const [hydrated, setHydrated] = React.useState(false);
  const [agents, setAgents] = React.useState<AgentRecord[]>([]);
  const [runs, setRuns] = React.useState<RunRecord[]>([]);

  React.useEffect(() => {
    setAgents(listAgents(userId));
    setRuns(listRuns(userId));
    setHydrated(true);
  }, [userId]);

  const agentsTools = React.useMemo(() => buildAgentsTools(), []);
  useWebMCPTools(agentsTools);

  // Merge: real agents first (newest first), then seeds that aren't
  // shadowed by a real agent with the same id.
  const unified: UnifiedAgent[] = React.useMemo(() => {
    if (!hydrated) return [];
    const realIds = new Set(agents.map((a) => a.id));
    const real: UnifiedAgent[] = agents.map((a) => toUnified(a, runs));
    const seeds: UnifiedAgent[] = seedAgents
      .filter((s) => !realIds.has(s.id))
      .map(toUnifiedSeed);
    return [...real, ...seeds];
  }, [hydrated, agents, runs]);

  // Live summary: count from real + seeds
  const summary = React.useMemo(() => {
    const counts = { running: 0, completed: 0, review: 0, failed: 0, totalProcessed: 0 };
    for (const a of unified) {
      if (a.status === "running" || a.status === "active") counts.running++;
      else if (a.status === "completed") {
        counts.completed++;
        counts.totalProcessed += a.total;
      } else if (a.status === "review") counts.review++;
      else if (a.status === "failed") counts.failed++;
      if (!a.isSeed) counts.totalProcessed += a.progress;
    }
    return counts;
  }, [unified]);

  return (
    <div className="page-container py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <p className="text-caption text-obsidian/50 mb-2">Agent Manager</p>
          <h1 className="text-display-md font-bold">Active sub-agents</h1>
          <p className="mt-2 text-body text-obsidian/70">
            {unified.length} agent{unified.length === 1 ? "" : "s"} · {summary.running} running · {summary.completed} done · {summary.review} needs your eyes
          </p>
        </div>
        <Button variant="light" size="md" href="/compose">
          ❖ Compose new agent
        </Button>
      </div>

      {/* Live summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <FeatureCard surface="dusty-sky" padding="md">
          <p className="text-caption opacity-60 mb-1">Running</p>
          <p className="text-display-md font-bold">{summary.running}</p>
        </FeatureCard>
        <FeatureCard surface="mist-mint" padding="md">
          <p className="text-caption opacity-60 mb-1">Completed</p>
          <p className="text-display-md font-bold">{summary.completed}</p>
        </FeatureCard>
        <FeatureCard surface="wisteria" padding="md">
          <p className="text-caption opacity-60 mb-1">Needs review</p>
          <p className="text-display-md font-bold">{summary.review}</p>
        </FeatureCard>
        <FeatureCard surface="desert-clay" padding="md">
          <p className="text-caption opacity-60 mb-1">Total processed</p>
          <p className="text-display-md font-bold">{summary.totalProcessed}</p>
        </FeatureCard>
      </div>

      {/* Agents list */}
      <div className="space-y-4">
        {unified.map((agent) => {
          const meta = statusMeta[agent.status] ?? statusMeta.active;
          const pct =
            agent.total > 0
              ? Math.min(100, Math.round((agent.progress / agent.total) * 100))
              : 0;
          return (
            <Link
              key={agent.id}
              href={`/agents/${agent.id}`}
              className="block group"
            >
              <FeatureCard
                surface="paper-white"
                padding="lg"
                className="hairline transition-transform group-hover:-translate-y-0.5"
              >
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-heading-sm font-bold truncate">
                        {agent.name}
                      </h3>
                      <FeatureTag variant={meta.color}>
                        {meta.symbol} {meta.label}
                      </FeatureTag>
                      {!agent.isSeed && (
                        <FeatureTag variant="iron">saved</FeatureTag>
                      )}
                    </div>
                    <p className="text-body-sm text-obsidian/70 mb-3">
                      {agent.goal}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-caption text-obsidian/50">
                      <span>Parent: {agent.parent}</span>
                      <span>·</span>
                      <span>Started {agent.spawnedAt}</span>
                    </div>
                    {agent.skills.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {agent.skills.slice(0, 4).map((s) => (
                          <FeatureTag key={s} variant="iron">
                            {s}
                          </FeatureTag>
                        ))}
                        {agent.skills.length > 4 && (
                          <FeatureTag variant="iron">
                            +{agent.skills.length - 4}
                          </FeatureTag>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="md:w-64 md:text-right">
                    <div className="flex items-center justify-between md:justify-end gap-2 mb-1">
                      <span className="text-caption text-obsidian/50 md:hidden">Progress</span>
                      <span className="text-caption font-bold tabular-nums">
                        {agent.progress}/{agent.total}
                      </span>
                    </div>
                    <div className="h-2 bg-iron rounded-full overflow-hidden mb-2">
                      <div
                        className={`h-full rounded-full ${
                          agent.status === "completed"
                            ? "bg-slate-teal"
                            : agent.status === "review"
                              ? "bg-saddle-brown"
                              : "bg-obsidian"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-caption text-obsidian/60">ETA: {agent.eta}</p>
                  </div>
                </div>
              </FeatureCard>
            </Link>
          );
        })}
        {unified.length === 0 && (
          <FeatureCard surface="paper-white" padding="lg" className="hairline text-center">
            <p className="text-heading-sm font-bold mb-2">No agents yet</p>
            <p className="text-body text-obsidian/60 mb-5">
              Each composer dispatch creates a saved sub-agent you can re-dispatch,
              link to a Trigger, or export as a portable <code className="font-mono">skill.md</code>.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link href="/compose">
                <Button variant="light" size="md">
                  ❖ Compose an agent
                </Button>
              </Link>
              <Link href="/compose?demo=true">
                <Button variant="outline-light" size="md">
                  ▶ Run the demo
                </Button>
              </Link>
            </div>
          </FeatureCard>
        )}
      </div>
    </div>
  );
}
