import Link from "next/link";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";

const skills = [
  {
    id: "rfp-response",
    name: "RFP Response Drafting",
    description: "Reads RFP PDFs and drafts answers from your knowledge vault.",
    color: "dusty-sky",
    trigger: "New PDF in Drive/RFPs",
    runs: 47,
    success: 95,
    lastRun: "2h ago",
    integrations: ["Drive", "Gmail", "Sheets"],
  },
  {
    id: "inbox-triage",
    name: "Inbox Triage",
    description: "Sorts, drafts replies, schedules meetings from your inbox.",
    color: "wisteria",
    trigger: "Every 15 min / New email",
    runs: 124,
    success: 98,
    lastRun: "5m ago",
    integrations: ["Gmail", "Calendar"],
  },
  {
    id: "pdf-sheets",
    name: "PDF → Sheets",
    description: "Extracts tabular data from PDFs into Google Sheets rows.",
    color: "desert-clay",
    trigger: "New PDF in Drive/Invoices",
    runs: 32,
    success: 100,
    lastRun: "1d ago",
    integrations: ["Drive", "Sheets"],
  },
  {
    id: "weekly-report",
    name: "Weekly Report Generator",
    description: "Pulls metrics, drafts a summary, posts to Slack.",
    color: "mist-mint",
    trigger: "Schedule · Mon 9am",
    runs: 8,
    success: 100,
    lastRun: "4d ago",
    integrations: ["Sheets", "Slack"],
  },
  {
    id: "lead-enricher",
    name: "LinkedIn Lead Enricher",
    description: "Enriches HubSpot leads with LinkedIn data and writes notes.",
    color: "dusty-sky",
    trigger: "Webhook from HubSpot",
    runs: 156,
    success: 92,
    lastRun: "12m ago",
    integrations: ["HubSpot", "LinkedIn"],
  },
  {
    id: "social-scheduler",
    name: "Social Media Scheduler",
    description: "Reformats blog posts into platform-specific social copy.",
    color: "wisteria",
    trigger: "New post in Ghost",
    runs: 23,
    success: 100,
    lastRun: "3d ago",
    integrations: ["Ghost", "Twitter", "LinkedIn"],
  },
];

export default function SkillsPage() {
  return (
    <div className="page-container py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <p className="text-caption text-obsidian/50 mb-2">Library</p>
          <h1 className="text-display-md font-bold">Your skills</h1>
          <p className="mt-2 text-body text-obsidian/70">
            6 skills · 390 lifetime runs · 96.7% success
          </p>
        </div>
        <Button variant="light" size="md" href="/record">
          ◉ Record new skill
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-8">
        <FeatureTag variant="obsidian">All · 6</FeatureTag>
        <FeatureTag variant="iron">Most used</FeatureTag>
        <FeatureTag variant="iron">Most reliable</FeatureTag>
        <FeatureTag variant="iron">Recent</FeatureTag>
        <FeatureTag variant="iron">Needs review</FeatureTag>
        <FeatureTag variant="iron">Auto-generated</FeatureTag>
      </div>

      {/* Skills grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {skills.map((skill) => (
          <Link
            key={skill.id}
            href={`/skills/${skill.id}`}
            className="group block"
          >
            <FeatureCard
              surface={skill.color as "dusty-sky" | "wisteria" | "desert-clay" | "mist-mint"}
              padding="lg"
              className="h-full transition-transform group-hover:-translate-y-1"
            >
              <div className="flex items-start justify-between mb-4">
                <FeatureTag variant="obsidian">Skill</FeatureTag>
                <span className="text-caption opacity-60 tabular-nums">
                  {skill.runs} runs
                </span>
              </div>
              <h3 className="text-heading-sm font-bold mb-2">{skill.name}</h3>
              <p className="text-body-sm mb-4 opacity-80">
                {skill.description}
              </p>

              <div className="space-y-2 text-caption">
                <div className="flex items-center gap-2">
                  <span className="opacity-60">Trigger:</span>
                  <span className="font-medium">{skill.trigger}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="opacity-60">Success:</span>
                  <span className="font-bold tabular-nums">
                    {skill.success}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="opacity-60">Last run:</span>
                  <span className="font-medium">{skill.lastRun}</span>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-obsidian/10 flex flex-wrap gap-1.5">
                {skill.integrations.map((i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-md bg-obsidian/8 text-caption font-medium"
                  >
                    {i}
                  </span>
                ))}
              </div>
            </FeatureCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
