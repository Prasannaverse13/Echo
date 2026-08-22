import Link from "next/link";
import { notFound } from "next/navigation";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";

const agentData: Record<
  string,
  {
    name: string;
    goal: string;
    parent: string;
    spawnedAt: string;
    progress: number;
    total: number;
    eta: string;
    status: "running" | "completed" | "review";
    skills: string[];
    trace: { ts: string; step: string; level: "info" | "success" | "warn" | "action" }[];
    cost: { label: string; value: string }[];
  }
> = {
  "rfp-responder": {
    name: "RFP Responder",
    goal: "Process 1,000 incoming RFPs and draft responses.",
    parent: "Auto-composed by Skill Manager",
    spawnedAt: "Aug 21, 09:14",
    progress: 234,
    total: 1000,
    eta: "~14h",
    status: "running",
    skills: ["RFP Response Drafting", "Slack Notifier"],
    trace: [
      { ts: "11:42:08", step: "Picked up input 'Globex RFI.pdf'", level: "info" },
      { ts: "11:42:09", step: "Extracted 23 questions from PDF", level: "success" },
      { ts: "11:42:11", step: "Searching knowledge vault...", level: "info" },
      { ts: "11:42:14", step: "Found 18 matches (5 high-confidence, 13 medium)", level: "info" },
      { ts: "11:42:18", step: "Drafting response to Q1: 'Company overview'", level: "action" },
      { ts: "11:42:19", step: "✓ Drafted (used 'about-us.md', case-study-acme.pdf)", level: "success" },
      { ts: "11:42:21", step: "Drafting response to Q2: 'SOC 2 compliance'", level: "action" },
      { ts: "11:42:24", step: "✓ Drafted (used soc2-report.pdf)", level: "success" },
      { ts: "11:42:26", step: "Drafting response to Q3: 'Pricing for 500 seats'", level: "action" },
      { ts: "11:42:28", step: "⚠ No high-confidence match. Flagged for human review.", level: "warn" },
      { ts: "11:42:31", step: "Saved draft to Drive/RFPs/globex-rfi-draft.docx", level: "success" },
      { ts: "11:42:32", step: "Notified #sales via Slack", level: "info" },
      { ts: "11:42:33", step: "─── Next input: 'Initech Security Audit.pdf' ───", level: "info" },
    ],
    cost: [
      { label: "Tokens used", value: "1.2M" },
      { label: "Estimated cost", value: "$0.84" },
      { label: "Runtime", value: "2h 28m" },
      { label: "Avg / run", value: "$0.004" },
    ],
  },
};

export default async function AgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agent = agentData[id];
  if (!agent) notFound();

  const pct = Math.round((agent.progress / agent.total) * 100);

  return (
    <div className="page-container py-10">
      <Link
        href="/app/agents"
        className="text-caption text-obsidian/60 hover:text-obsidian mb-6 inline-block"
      >
        ← Back to agents
      </Link>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <FeatureTag variant="desert-clay">◉ Running</FeatureTag>
            <FeatureTag variant="iron">Sub-agent</FeatureTag>
          </div>
          <h1 className="text-display-md font-bold">{agent.name}</h1>
          <p className="mt-3 text-body text-obsidian/70 max-w-2xl">
            {agent.goal}
          </p>
          <p className="mt-2 text-caption text-obsidian/50">
            {agent.parent} · Started {agent.spawnedAt}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline-light" size="md">
            ⏸ Pause
          </Button>
          <Button variant="light" size="md">
            ⏹ Stop
          </Button>
        </div>
      </div>

      {/* Progress hero */}
      <FeatureCard surface="deep-teal" padding="lg" className="text-paper-white mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-caption text-paper-white/60 uppercase tracking-wider">
            Progress
          </span>
          <span className="text-heading font-bold tabular-nums">
            {agent.progress} / {agent.total}
          </span>
        </div>
        <div className="h-2 bg-paper-white/10 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-paper-white rounded-full"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-caption text-paper-white/70">
          <span>{pct}% complete</span>
          <span>ETA: {agent.eta}</span>
        </div>
      </FeatureCard>

      {/* Cost stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {agent.cost.map((c) => (
          <FeatureCard key={c.label} surface="paper-white" padding="md" className="hairline">
            <p className="text-caption text-obsidian/50 mb-1">{c.label}</p>
            <p className="text-heading-sm font-bold tabular-nums">{c.value}</p>
          </FeatureCard>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live trace */}
        <div className="lg:col-span-2">
          <h2 className="text-heading-sm font-bold mb-4">Live execution trace</h2>
          <FeatureCard surface="obsidian" padding="md" className="font-mono text-caption">
            <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
              {agent.trace.map((t, i) => {
                const color =
                  t.level === "success"
                    ? "text-emerald-400"
                    : t.level === "warn"
                      ? "text-amber-400"
                      : t.level === "action"
                        ? "text-sky-300"
                        : "text-paper-white/60";
                return (
                  <div key={i} className="flex gap-3">
                    <span className="text-paper-white/30 tabular-nums shrink-0">
                      {t.ts}
                    </span>
                    <span className={color}>{t.step}</span>
                  </div>
                );
              })}
              <div className="flex gap-3 mt-2 text-paper-white/40">
                <span className="tabular-nums">11:42:34</span>
                <span className="animate-pulse">▍</span>
              </div>
            </div>
          </FeatureCard>
        </div>

        {/* Skills in use */}
        <div className="space-y-4">
          <FeatureCard surface="paper-white" padding="md" className="hairline">
            <h3 className="text-caption font-medium uppercase opacity-60 mb-3">
              Skills in use
            </h3>
            <ul className="space-y-2">
              {agent.skills.map((s, i) => (
                <li
                  key={s}
                  className="flex items-center gap-3 text-body-sm"
                >
                  <span className="w-6 h-6 rounded-full bg-obsidian text-paper-white flex items-center justify-center text-caption font-bold shrink-0">
                    {i + 1}
                  </span>
                  <span className="font-medium">{s}</span>
                </li>
              ))}
            </ul>
          </FeatureCard>

          <FeatureCard surface="dusty-sky" padding="md">
            <h3 className="text-caption font-medium uppercase opacity-60 mb-2">
              Take over
            </h3>
            <p className="text-body-sm mb-3">
              Need to manually handle this run? Take over the agent and Echo
              will pause until you release control.
            </p>
            <Button variant="light" size="sm" className="w-full">
              Take over
            </Button>
          </FeatureCard>

          <FeatureCard surface="wisteria" padding="md">
            <h3 className="text-caption font-medium uppercase opacity-60 mb-2">
              Save as skill
            </h3>
            <p className="text-body-sm mb-3">
              This run is doing great. Convert it to a reusable skill the
              team can clone.
            </p>
            <Button variant="light" size="sm" className="w-full">
              Convert to skill
            </Button>
          </FeatureCard>
        </div>
      </div>
    </div>
  );
}
