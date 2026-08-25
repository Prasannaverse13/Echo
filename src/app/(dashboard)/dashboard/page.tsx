import Link from "next/link";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";

const activeAgents = [
  {
    name: "RFP Responder",
    progress: 234,
    total: 1000,
    status: "running",
    skill: "RFP Response Drafting",
  },
  {
    name: "Inbox Butler",
    progress: 47,
    total: 47,
    status: "completed",
    skill: "Email Triage",
  },
  {
    name: "Lead Enricher",
    progress: 12,
    total: 200,
    status: "running",
    skill: "LinkedIn Enrichment",
  },
];

const recentSkills = [
  { name: "RFP Response Drafting", runs: 47, success: 95, color: "dusty-sky" },
  { name: "Inbox Triage", runs: 124, success: 98, color: "wisteria" },
  { name: "PDF → Sheets", runs: 32, success: 100, color: "desert-clay" },
  { name: "Weekly Report Generator", runs: 8, success: 100, color: "mist-mint" },
];

export default function DashboardPage() {
  return (
    <div className="page-container py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <p className="text-caption text-obsidian/50 mb-2">
            Friday, August 21
          </p>
          <h1 className="text-[44px] md:text-[56px] font-bold leading-[1.1] tracking-[-0.04em] text-obsidian">
            Welcome back, Ada.
          </h1>
        </div>
        <div className="flex gap-3">
          <Button variant="outline-light" size="md" href="/record">
            ◉ Record new skill
          </Button>
          <Button variant="light" size="md" href="/compose">
            ❖ Compose agent
          </Button>
        </div>
      </div>

      {/* Hero metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        <FeatureCard surface="paper-white" padding="md" className="hairline">
          <p className="text-caption text-obsidian/50 mb-1">Skills</p>
          <p className="text-display-md font-bold">12</p>
          <p className="text-caption text-obsidian/50 mt-1">+2 this week</p>
        </FeatureCard>
        <FeatureCard surface="paper-white" padding="md" className="hairline">
          <p className="text-caption text-obsidian/50 mb-1">Runs today</p>
          <p className="text-display-md font-bold">293</p>
          <p className="text-caption text-obsidian/50 mt-1">+47 vs yesterday</p>
        </FeatureCard>
        <FeatureCard surface="paper-white" padding="md" className="hairline">
          <p className="text-caption text-obsidian/50 mb-1">Active agents</p>
          <p className="text-display-md font-bold">3</p>
          <p className="text-caption text-obsidian/50 mt-1">2 running, 1 done</p>
        </FeatureCard>
        <FeatureCard surface="paper-white" padding="md" className="hairline">
          <p className="text-caption text-obsidian/50 mb-1">Success rate</p>
          <p className="text-display-md font-bold">98.4%</p>
          <p className="text-caption text-obsidian/50 mt-1">Last 30 days</p>
        </FeatureCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
        {/* Active agents */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-heading-sm font-bold">Active agents</h2>
            <Link
              href="/agents"
              className="text-caption font-medium hover:underline underline-offset-4"
            >
              View all →
            </Link>
          </div>
          <div className="space-y-3">
            {activeAgents.map((agent) => {
              const pct = Math.round((agent.progress / agent.total) * 100);
              const isDone = agent.status === "completed";
              return (
                <FeatureCard
                  key={agent.name}
                  surface="paper-white"
                  padding="md"
                  className="hairline"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-body font-medium truncate">
                          {agent.name}
                        </h3>
                        <FeatureTag
                          variant={isDone ? "mist-mint" : "desert-clay"}
                        >
                          {isDone ? "✓ Done" : "◉ Running"}
                        </FeatureTag>
                      </div>
                      <p className="text-caption text-obsidian/50">
                        Using skill: {agent.skill}
                      </p>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-iron rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isDone ? "bg-slate-teal" : "bg-obsidian"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-caption font-medium tabular-nums">
                          {agent.progress}/{agent.total}
                        </span>
                      </div>
                    </div>
                  </div>
                </FeatureCard>
              );
            })}
          </div>
        </div>

        {/* Insights */}
        <div>
          <h2 className="text-heading-sm font-bold mb-4">Echo's read</h2>
          <div className="space-y-3">
            <FeatureCard surface="dusty-sky" padding="md">
              <p className="text-caption font-medium mb-1">Skill suggestion</p>
              <p className="text-body-sm">
                You exported 4 CSVs this week. Want to record{" "}
                <em>CSV Cleanup</em> as a skill?
              </p>
            </FeatureCard>
            <FeatureCard surface="wisteria" padding="md">
              <p className="text-caption font-medium mb-1">Composition ready</p>
              <p className="text-body-sm">
                <em>Inbox Triage</em> + <em>CRM Update</em> can chain into{" "}
                <em>Lead Pipeline</em>. Auto-create?
              </p>
            </FeatureCard>
            <FeatureCard surface="desert-clay" padding="md">
              <p className="text-caption font-medium mb-1">Needs review</p>
              <p className="text-body-sm">
                <em>PDF → Sheets</em> failed 2x on scanned PDFs. Re-record?
              </p>
            </FeatureCard>
          </div>
        </div>
      </div>

      {/* Skills summary */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-heading-sm font-bold">Your skills</h2>
          <Link
            href="/skills"
            className="text-caption font-medium hover:underline underline-offset-4"
          >
            View library →
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {recentSkills.map((skill) => (
            <FeatureCard
              key={skill.name}
              surface={skill.color as "dusty-sky" | "wisteria" | "desert-clay" | "mist-mint"}
              padding="md"
            >
              <h4 className="text-body font-bold mb-2">{skill.name}</h4>
              <p className="text-caption opacity-70">{skill.runs} runs</p>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-heading-sm font-bold tabular-nums">
                  {skill.success}%
                </span>
                <span className="text-caption opacity-60">success</span>
              </div>
            </FeatureCard>
          ))}
        </div>
      </div>
    </div>
  );
}
