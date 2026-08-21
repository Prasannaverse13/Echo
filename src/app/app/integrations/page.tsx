import { Button, FeatureTag, FeatureCard } from "@/components/ui";

const integrations = [
  { name: "Google Drive", desc: "Watch folders, write files", connected: true, color: "dusty-sky" as const },
  { name: "Gmail", desc: "Read, draft, send emails", connected: true, color: "wisteria" as const },
  { name: "Google Sheets", desc: "Read, write, append rows", connected: true, color: "desert-clay" as const },
  { name: "Google Calendar", desc: "Read events, schedule meetings", connected: true, color: "mist-mint" as const },
  { name: "Slack", desc: "Read channels, post messages", connected: true, color: "wisteria" as const },
  { name: "HubSpot", desc: "Fetch leads, update contacts", connected: true, color: "dusty-sky" as const },
  { name: "LinkedIn", desc: "Enrich profiles (Sales Navigator)", connected: true, color: "desert-clay" as const },
  { name: "Notion", desc: "Read, write pages and databases", connected: false, color: "mist-mint" as const },
  { name: "GitHub", desc: "Read issues, create PRs", connected: false, color: "dusty-sky" as const },
  { name: "Stripe", desc: "Read customers and usage", connected: false, color: "wisteria" as const },
  { name: "Airtable", desc: "Read, write records", connected: false, color: "desert-clay" as const },
  { name: "Zapier", desc: "Bridge to 5,000+ apps", connected: false, color: "mist-mint" as const },
];

export default function IntegrationsPage() {
  return (
    <div className="page-container py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <p className="text-caption text-obsidian/50 mb-2">Connections</p>
          <h1 className="text-display-md font-bold">Integrations</h1>
          <p className="mt-2 text-body text-obsidian/70">
            7 connected · 5 available · Suggest more
          </p>
        </div>
        <Button variant="outline-light" size="md">+ Request integration</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map((i) => (
          <FeatureCard
            key={i.name}
            surface={i.color}
            padding="lg"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-12 h-12 rounded-2xl bg-obsidian/10 flex items-center justify-center text-heading-sm font-bold">
                {i.name[0]}
              </div>
              <FeatureTag variant={i.connected ? "obsidian" : "iron"}>
                {i.connected ? "● Connected" : "○ Connect"}
              </FeatureTag>
            </div>
            <h3 className="text-body font-bold mb-1">{i.name}</h3>
            <p className="text-body-sm opacity-80 mb-4">{i.desc}</p>
            <Button variant={i.connected ? "outline-light" : "light"} size="sm" className="w-full">
              {i.connected ? "Manage" : "Connect"}
            </Button>
          </FeatureCard>
        ))}
      </div>
    </div>
  );
}
