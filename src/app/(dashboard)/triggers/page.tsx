import { Button, FeatureTag, FeatureCard } from "@/components/ui";

const triggers = [
  { name: "New PDF in Drive/RFPs", type: "Event", skill: "RFP Response Drafting", status: "active", lastFired: "2h ago" },
  { name: "Every 15 minutes", type: "Schedule", skill: "Inbox Triage", status: "active", lastFired: "5m ago" },
  { name: "Every Monday 9am", type: "Schedule", skill: "Weekly Report Generator", status: "active", lastFired: "1d ago" },
  { name: "HubSpot webhook", type: "Webhook", skill: "LinkedIn Lead Enricher", status: "active", lastFired: "12m ago" },
  { name: "New post in Ghost", type: "Event", skill: "Social Media Scheduler", status: "paused", lastFired: "3d ago" },
  { name: "Friday 5pm", type: "Schedule", skill: "Lead Pipeline Composer", status: "active", lastFired: "—" },
];

export default function TriggersPage() {
  return (
    <div className="page-container py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <p className="text-caption text-obsidian/50 mb-2">Automation</p>
          <h1 className="text-display-md font-bold">Triggers</h1>
          <p className="mt-2 text-body text-obsidian/70">
            6 active triggers · 2 paused
          </p>
        </div>
        <Button variant="light" size="md">+ New trigger</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {triggers.map((t) => (
          <FeatureCard
            key={t.name}
            surface="paper-white"
            padding="lg"
            className="hairline"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FeatureTag variant="iron">{t.type}</FeatureTag>
                  <FeatureTag variant={t.status === "active" ? "mist-mint" : "iron"}>
                    {t.status === "active" ? "● Active" : "⏸ Paused"}
                  </FeatureTag>
                </div>
                <h3 className="text-body font-bold">{t.name}</h3>
              </div>
              <button className="text-obsidian/40 hover:text-obsidian">⋯</button>
            </div>
            <div className="space-y-1 text-caption text-obsidian/60">
              <p>Runs skill: <span className="font-medium text-obsidian">{t.skill}</span></p>
              <p>Last fired: {t.lastFired}</p>
            </div>
          </FeatureCard>
        ))}
      </div>

      <div className="mt-10">
        <h2 className="text-heading-sm font-bold mb-4">Trigger types</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { name: "Event", desc: "File arrives, email received, form submitted", color: "dusty-sky" as const },
            { name: "Schedule", desc: "Cron, recurring, one-time future", color: "wisteria" as const },
            { name: "Webhook", desc: "External system POSTs to Echo", color: "desert-clay" as const },
            { name: "Manual", desc: "On-demand from UI or API", color: "mist-mint" as const },
          ].map((tt) => (
            <FeatureCard key={tt.name} surface={tt.color} padding="md">
              <p className="text-caption font-medium uppercase opacity-60 mb-1">
                {tt.name}
              </p>
              <p className="text-body-sm">{tt.desc}</p>
            </FeatureCard>
          ))}
        </div>
      </div>
    </div>
  );
}
