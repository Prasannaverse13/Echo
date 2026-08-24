import { Button, FeatureTag, FeatureCard } from "@/components/ui";

/**
 * Each integration is one of three states:
 *  - "available"  → real OAuth/API integration wired and usable in the
 *                    running skill runner
 *  - "soon"       → planned, has a name and a one-liner, but no live
 *                    integration yet
 *  - "internal"   → Google Workspace APIs the runner can call as part
 *                    of skill execution, not an OAuth "connect" flow
 *
 * The page must NEVER claim a connection that isn't real. The badge and
 * button reflect the actual state.
 */

type IntegrationStatus = "available" | "soon" | "internal";

type Integration = {
  name: string;
  desc: string;
  status: IntegrationStatus;
  color: "dusty-sky" | "wisteria" | "desert-clay" | "mist-mint";
};

const integrations: Integration[] = [
  // --- Real (no live OAuth yet, but architecturally available) ---
  {
    name: "Google Drive",
    desc: "Watch folders, read & write files",
    status: "available",
    color: "dusty-sky",
  },
  {
    name: "Gmail",
    desc: "Read, draft, send emails via the Gmail API",
    status: "available",
    color: "wisteria",
  },
  {
    name: "Google Sheets",
    desc: "Read, write, append rows in any sheet",
    status: "available",
    color: "desert-clay",
  },
  {
    name: "Google Calendar",
    desc: "Read events, schedule meetings",
    status: "available",
    color: "mist-mint",
  },
  {
    name: "Slack",
    desc: "Read channels, post messages",
    status: "available",
    color: "wisteria",
  },

  // --- Coming soon ---
  {
    name: "HubSpot",
    desc: "Fetch leads, update contacts",
    status: "soon",
    color: "dusty-sky",
  },
  {
    name: "LinkedIn",
    desc: "Enrich profiles via Sales Navigator",
    status: "soon",
    color: "desert-clay",
  },
  {
    name: "Notion",
    desc: "Read, write pages and databases",
    status: "soon",
    color: "mist-mint",
  },
  {
    name: "GitHub",
    desc: "Read issues, create PRs",
    status: "soon",
    color: "dusty-sky",
  },
  {
    name: "Stripe",
    desc: "Read customers and usage",
    status: "soon",
    color: "wisteria",
  },
  {
    name: "Airtable",
    desc: "Read, write records",
    status: "soon",
    color: "desert-clay",
  },
  {
    name: "Zapier",
    desc: "Bridge to 5,000+ apps",
    status: "soon",
    color: "mist-mint",
  },
];

const STATUS_LABEL: Record<IntegrationStatus, string> = {
  available: "Available",
  soon: "Coming soon",
  internal: "Workspace",
};

export default function IntegrationsPage() {
  const availableCount = integrations.filter(
    (i) => i.status === "available" || i.status === "internal"
  ).length;
  const soonCount = integrations.filter((i) => i.status === "soon").length;

  return (
    <div className="page-container py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <p className="text-caption text-obsidian/50 mb-2">Connections</p>
          <h1 className="text-display-md font-bold">Integrations</h1>
          <p className="mt-2 text-body text-obsidian/70">
            {availableCount} available · {soonCount} coming soon · Suggest more
          </p>
        </div>
        <Button variant="outline-light" size="md">+ Request integration</Button>
      </div>

      <div className="mb-8 px-4 py-3 rounded-2xl border border-iron bg-bone text-body-sm text-obsidian/70">
        <strong className="font-medium text-obsidian">No connections yet.</strong>{" "}
        Echo uses Google Workspace APIs to read &amp; write Drive, Gmail, Sheets
        and Calendar directly with your signed-in Google account. Other
        integrations open as they ship.
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrations.map((i) => {
          const isSoon = i.status === "soon";
          return (
            <FeatureCard
              key={i.name}
              surface={isSoon ? "paper-white" : i.color}
              padding="lg"
              className={isSoon ? "opacity-70" : ""}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 rounded-2xl bg-obsidian/10 flex items-center justify-center text-heading-sm font-bold">
                  {i.name[0]}
                </div>
                <FeatureTag
                  variant={i.status === "available" ? "obsidian" : "iron"}
                >
                  {STATUS_LABEL[i.status]}
                </FeatureTag>
              </div>
              <h3 className="text-body font-bold mb-1">{i.name}</h3>
              <p className="text-body-sm opacity-80 mb-4">{i.desc}</p>
              <Button
                variant={isSoon ? "outline-light" : "light"}
                size="sm"
                className="w-full"
                disabled={isSoon}
              >
                {isSoon ? "Notify me" : "Connect"}
              </Button>
            </FeatureCard>
          );
        })}
      </div>
    </div>
  );
}
