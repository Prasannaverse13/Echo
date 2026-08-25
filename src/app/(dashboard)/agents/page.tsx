import Link from "next/link";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";

const agents = [
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
};

export default function AgentsPage() {
  return (
    <div className="page-container py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <p className="text-caption text-obsidian/50 mb-2">Agent Manager</p>
          <h1 className="text-display-md font-bold">Active sub-agents</h1>
          <p className="mt-2 text-body text-obsidian/70">
            6 agents · 3 running · 2 done · 1 needs your eyes
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
          <p className="text-display-md font-bold">3</p>
        </FeatureCard>
        <FeatureCard surface="mist-mint" padding="md">
          <p className="text-caption opacity-60 mb-1">Completed</p>
          <p className="text-display-md font-bold">2</p>
        </FeatureCard>
        <FeatureCard surface="wisteria" padding="md">
          <p className="text-caption opacity-60 mb-1">Needs review</p>
          <p className="text-display-md font-bold">1</p>
        </FeatureCard>
        <FeatureCard surface="desert-clay" padding="md">
          <p className="text-caption opacity-60 mb-1">Total processed</p>
          <p className="text-display-md font-bold">802</p>
        </FeatureCard>
      </div>

      {/* Agents list */}
      <div className="space-y-4">
        {agents.map((agent) => {
          const meta = statusMeta[agent.status];
          const pct = Math.round((agent.progress / agent.total) * 100);
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
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-heading-sm font-bold truncate">
                        {agent.name}
                      </h3>
                      <FeatureTag variant={meta.color}>
                        {meta.symbol} {meta.label}
                      </FeatureTag>
                    </div>
                    <p className="text-body-sm text-obsidian/70 mb-3">
                      {agent.goal}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-caption text-obsidian/50">
                      <span>Parent: {agent.parent}</span>
                      <span>·</span>
                      <span>Started {agent.spawnedAt}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {agent.skills.map((s) => (
                        <FeatureTag key={s} variant="iron">
                          {s}
                        </FeatureTag>
                      ))}
                    </div>
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
      </div>
    </div>
  );
}
