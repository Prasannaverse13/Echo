import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";

const skillData: Record<
  string,
  {
    name: string;
    description: string;
    color: "dusty-sky" | "wisteria" | "desert-clay" | "mist-mint";
    intent: string;
    trigger: string;
    steps: { num: number; title: string; detail: string }[];
    integrations: string[];
    stats: { label: string; value: string }[];
    runHistory: {
      id: string;
      input: string;
      status: "success" | "failed" | "review";
      duration: string;
      when: string;
    }[];
  }
> = {
  "rfp-response": {
    name: "RFP Response Drafting",
    description: "Reads RFP PDFs and drafts answers from your knowledge vault.",
    color: "dusty-sky",
    intent:
      "When an RFP PDF arrives in Drive/RFPs, read every question, search the knowledge vault for matching content, and draft a complete response document with citations.",
    trigger: "New file in Drive/RFPs",
    steps: [
      {
        num: 1,
        title: "Detect new RFP",
        detail: "Watch Drive/RFPs folder for new PDF uploads.",
      },
      {
        num: 2,
        title: "Extract questions",
        detail:
          "Read PDF, identify all questions (numbered, bulleted, or section headers).",
      },
      {
        num: 3,
        title: "Search knowledge vault",
        detail:
          "For each question, semantically search the vault (past RFPs, case studies, product docs).",
      },
      {
        num: 4,
        title: "Draft responses",
        detail:
          "Generate a response for each question with inline citations to source docs.",
      },
      {
        num: 5,
        title: "Flag for review",
        detail:
          "Mark questions with low-confidence matches as 'needs human review' before saving.",
      },
    ],
    integrations: ["Drive", "Gmail", "Sheets", "Slack"],
    stats: [
      { label: "Total runs", value: "47" },
      { label: "Success rate", value: "95.7%" },
      { label: "Avg duration", value: "4m 12s" },
      { label: "Avg time saved", value: "12h/run" },
    ],
    runHistory: [
      {
        id: "run_2401",
        input: "Acme Corp RFP Q3.pdf",
        status: "success",
        duration: "3m 42s",
        when: "2h ago",
      },
      {
        id: "run_2400",
        input: "Globex Industries RFI.pdf",
        status: "success",
        duration: "5m 11s",
        when: "1d ago",
      },
      {
        id: "run_2399",
        input: "Initech Security Audit.pdf",
        status: "review",
        duration: "4m 30s",
        when: "1d ago",
      },
      {
        id: "run_2398",
        input: "scanned-form-2024.pdf",
        status: "failed",
        duration: "0m 8s",
        when: "2d ago",
      },
      {
        id: "run_2397",
        input: "Stark Industries RFP.pdf",
        status: "success",
        duration: "4m 02s",
        when: "3d ago",
      },
    ],
  },
};

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const skill = skillData[id];
  if (!skill) notFound();

  return (
    <div className="page-container py-10">
      <Link
        href="/app/skills"
        className="text-caption text-obsidian/60 hover:text-obsidian mb-6 inline-block"
      >
        ← Back to skills
      </Link>

      {/* Hero */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <FeatureTag variant="obsidian">Skill</FeatureTag>
            <FeatureTag variant="iron">v3</FeatureTag>
            <FeatureTag variant="mist-mint">Healthy</FeatureTag>
          </div>
          <h1 className="text-display-md font-bold">{skill.name}</h1>
          <p className="mt-3 text-body text-obsidian/70 max-w-2xl">
            {skill.description}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline-light" size="md">
            ✎ Edit
          </Button>
          <Button variant="light" size="md">
            ▶ Run now
          </Button>
        </div>
      </div>

      {/* Stats */}
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
            <h2 className="text-heading-sm font-bold mb-4">Reconstructed steps</h2>
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
                      <h3 className="text-body font-bold mb-1">{step.title}</h3>
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
            <Button variant="outline-light" size="sm" className="mt-3 w-full">
              Edit trigger
            </Button>
          </FeatureCard>

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

          <FeatureCard surface="wisteria" padding="md">
            <h3 className="text-caption font-medium uppercase opacity-60 mb-2">
              Manager suggests
            </h3>
            <p className="text-body-sm">
              Combine with <em>Slack Notifier</em> to auto-ping the sales
              channel when an RFP lands.
            </p>
            <Button variant="light" size="sm" className="mt-3 w-full">
              + Create composed skill
            </Button>
          </FeatureCard>
        </div>
      </div>

      {/* Run history */}
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
    </div>
  );
}
