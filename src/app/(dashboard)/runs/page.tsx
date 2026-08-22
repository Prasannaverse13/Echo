import { Button, FeatureTag, FeatureCard } from "@/components/ui";

const runs = [
  { id: "r_8421", skill: "RFP Response Drafting", input: "Acme Corp RFP Q3.pdf", status: "success", duration: "3m 42s", when: "2h ago", agent: "RFP Responder" },
  { id: "r_8420", skill: "Inbox Triage", input: "47 emails", status: "success", duration: "1m 12s", when: "5m ago", agent: "Inbox Butler" },
  { id: "r_8419", skill: "LinkedIn Lead Enricher", input: "12 leads", status: "success", duration: "4m 03s", when: "12m ago", agent: "Lead Enricher" },
  { id: "r_8418", skill: "RFP Response Drafting", input: "scanned-form-2024.pdf", status: "failed", duration: "0m 8s", when: "2h ago", agent: "RFP Responder" },
  { id: "r_8417", skill: "Weekly Report Generator", input: "Aug 14-20 metrics", status: "success", duration: "2m 41s", when: "1d ago", agent: "Weekly Reporter" },
  { id: "r_8416", skill: "Social Media Scheduler", input: "blog-post-3.md", status: "review", duration: "0m 31s", when: "3d ago", agent: "Social Amplifier" },
  { id: "r_8415", skill: "CSV Cleanup", input: "q3-export.csv", status: "success", duration: "0m 14s", when: "1d ago", agent: "CSV Cleaner" },
  { id: "r_8414", skill: "HubSpot Lead Fetcher", input: "weekly sync", status: "success", duration: "0m 47s", when: "4d ago", agent: "Lead Enricher" },
];

export default function RunsPage() {
  return (
    <div className="page-container py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <p className="text-caption text-obsidian/50 mb-2">History</p>
          <h1 className="text-display-md font-bold">All runs</h1>
          <p className="mt-2 text-body text-obsidian/70">
            390 total · 376 success · 8 failed · 6 needs review
          </p>
        </div>
        <Button variant="outline-light" size="md">↓ Export CSV</Button>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <FeatureTag variant="obsidian">All · 390</FeatureTag>
        <FeatureTag variant="iron">Success</FeatureTag>
        <FeatureTag variant="iron">Failed</FeatureTag>
        <FeatureTag variant="iron">Needs review</FeatureTag>
        <FeatureTag variant="iron">Today</FeatureTag>
        <FeatureTag variant="iron">This week</FeatureTag>
      </div>

      <FeatureCard surface="paper-white" padding="md" className="hairline overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-iron">
              <th className="text-caption font-medium uppercase opacity-60 py-3">Run</th>
              <th className="text-caption font-medium uppercase opacity-60 py-3">Skill</th>
              <th className="text-caption font-medium uppercase opacity-60 py-3">Input</th>
              <th className="text-caption font-medium uppercase opacity-60 py-3">Status</th>
              <th className="text-caption font-medium uppercase opacity-60 py-3">Agent</th>
              <th className="text-caption font-medium uppercase opacity-60 py-3">Duration</th>
              <th className="text-caption font-medium uppercase opacity-60 py-3">When</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.id} className="border-b border-iron last:border-0 hover:bg-bone/50">
                <td className="py-3 text-caption font-mono">{run.id}</td>
                <td className="py-3 text-body-sm font-medium">{run.skill}</td>
                <td className="py-3 text-body-sm text-obsidian/70">{run.input}</td>
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
                <td className="py-3 text-body-sm text-obsidian/70">{run.agent}</td>
                <td className="py-3 text-body-sm tabular-nums">{run.duration}</td>
                <td className="py-3 text-caption text-obsidian/60">{run.when}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </FeatureCard>
    </div>
  );
}
