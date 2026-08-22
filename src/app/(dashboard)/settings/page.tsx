import { Button, FeatureTag, FeatureCard } from "@/components/ui";

export default function SettingsPage() {
  return (
    <div className="page-container py-10">
      <div className="mb-8">
        <p className="text-caption text-obsidian/50 mb-2">Account</p>
        <h1 className="text-display-md font-bold">Settings</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <FeatureCard surface="paper-white" padding="lg" className="hairline">
            <h2 className="text-heading-sm font-bold mb-4">Profile</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-caption font-medium block mb-1">Name</label>
                <input type="text" defaultValue="Ada Lovelace" className="w-full px-3 py-2 rounded-lg border border-iron text-body-sm" />
              </div>
              <div>
                <label className="text-caption font-medium block mb-1">Email</label>
                <input type="email" defaultValue="ada@analytical.engine" className="w-full px-3 py-2 rounded-lg border border-iron text-body-sm" />
              </div>
              <div>
                <label className="text-caption font-medium block mb-1">Workspace</label>
                <input type="text" defaultValue="Personal" className="w-full px-3 py-2 rounded-lg border border-iron text-body-sm" />
              </div>
              <div>
                <label className="text-caption font-medium block mb-1">Timezone</label>
                <input type="text" defaultValue="Asia/Kolkata (IST)" className="w-full px-3 py-2 rounded-lg border border-iron text-body-sm" />
              </div>
            </div>
            <Button variant="light" size="sm" className="mt-4">Save</Button>
          </FeatureCard>

          <FeatureCard surface="paper-white" padding="lg" className="hairline">
            <h2 className="text-heading-sm font-bold mb-4">Notifications</h2>
            <div className="space-y-3">
              {[
                { label: "Agent completes a run", channel: "Slack + Email", on: true },
                { label: "Agent needs my input", channel: "Slack + Email", on: true },
                { label: "Agent fails", channel: "Email", on: true },
                { label: "Daily summary", channel: "Email", on: false },
                { label: "Weekly summary", channel: "Email", on: true },
              ].map((n) => (
                <div key={n.label} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-body-sm font-medium">{n.label}</p>
                    <p className="text-caption text-obsidian/50">{n.channel}</p>
                  </div>
                  <button
                    className={`w-11 h-6 rounded-full transition-colors ${
                      n.on ? "bg-obsidian" : "bg-pewter"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-paper-white transition-transform ${
                        n.on ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </FeatureCard>

          <FeatureCard surface="paper-white" padding="lg" className="hairline">
            <h2 className="text-heading-sm font-bold mb-4">Data & Privacy</h2>
            <div className="space-y-4">
              <div>
                <p className="text-body-sm font-medium">Recording retention</p>
                <p className="text-caption text-obsidian/50 mb-2">How long Echo keeps screen recordings after a skill is learned.</p>
                <select className="px-3 py-2 rounded-lg border border-iron text-body-sm">
                  <option>7 days (recommended)</option>
                  <option>30 days</option>
                  <option>90 days</option>
                  <option>Never delete</option>
                </select>
              </div>
              <div>
                <p className="text-body-sm font-medium">Export data</p>
                <p className="text-caption text-obsidian/50 mb-2">Download all your skills, runs, and recordings.</p>
                <Button variant="outline-light" size="sm">Request export</Button>
              </div>
            </div>
          </FeatureCard>
        </div>

        <div className="space-y-6">
          <FeatureCard surface="sandstone" padding="lg">
            <h3 className="text-caption font-medium uppercase opacity-60 mb-2">Plan</h3>
            <p className="text-heading-sm font-bold mb-1">Free</p>
            <p className="text-body-sm opacity-70 mb-4">3 of 5 skills used</p>
            <Button variant="light" size="sm" className="w-full" href="/pricing">
              Upgrade to Pro
            </Button>
          </FeatureCard>

          <FeatureCard surface="paper-white" padding="lg" className="hairline">
            <h3 className="text-caption font-medium uppercase opacity-60 mb-3">API</h3>
            <p className="text-body-sm mb-3">Trigger any skill via API or webhook.</p>
            <code className="block p-3 rounded-lg bg-bone text-caption font-mono mb-3 break-all">
              echo_sk_live_••••••••3a8f
            </code>
            <Button variant="outline-light" size="sm" className="w-full">
              View API docs
            </Button>
          </FeatureCard>

          <FeatureCard surface="paper-white" padding="lg" className="hairline">
            <h3 className="text-caption font-medium uppercase opacity-60 mb-3">Danger zone</h3>
            <Button variant="outline-light" size="sm" className="w-full mb-2">
              Reset all skills
            </Button>
            <Button variant="outline-light" size="sm" className="w-full">
              Delete account
            </Button>
          </FeatureCard>
        </div>
      </div>
    </div>
  );
}
