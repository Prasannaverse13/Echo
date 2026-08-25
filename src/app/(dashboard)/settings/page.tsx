"use client";

import * as React from "react";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";
import { getSession, type Session } from "@/lib/auth/auth";

const NOTIFICATIONS = [
  { key: "agent_complete", label: "Agent completes a run", channel: "Slack + Email", on: true },
  { key: "agent_needs_input", label: "Agent needs my input", channel: "Slack + Email", on: true },
  { key: "agent_fails", label: "Agent fails", channel: "Email", on: true },
  { key: "daily_summary", label: "Daily summary", channel: "Email", on: false },
  { key: "weekly_summary", label: "Weekly summary", channel: "Email", on: true },
] as const;

export default function SettingsPage() {
  const [session, setSession] = React.useState<Session | null>(null);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [workspace, setWorkspace] = React.useState("Personal");
  const [timezone, setTimezone] = React.useState("");
  const [saved, setSaved] = React.useState(false);

  // Initial load from the real auth session
  React.useEffect(() => {
    const s = getSession();
    setSession(s);
    if (s) {
      setName(s.name);
      setEmail(s.email);
    }
  }, []);

  // Cross-tab updates (logout in another tab, etc.)
  React.useEffect(() => {
    const refresh = () => {
      const s = getSession();
      setSession(s);
      if (s) {
        setName(s.name);
        setEmail(s.email);
      }
    };
    window.addEventListener("echo:auth", refresh);
    return () => window.removeEventListener("echo:auth", refresh);
  }, []);

  const save = () => {
    if (typeof window === "undefined") return;
    const s = getSession();
    if (!s) return;
    // Persist name + email back to the active session (the auth module
    // owns the session shape; we just patch name/email and write back).
    const updated: Session = { ...s, name: name.trim() || s.name, email: email.trim() || s.email };
    try {
      window.localStorage.setItem("echo.session", JSON.stringify(updated));
      // Update the registered user's record too
      const raw = window.localStorage.getItem("echo.users");
      if (raw) {
        const users = JSON.parse(raw) as Array<{ userId: string; email: string; name: string }>;
        const idx = users.findIndex((u) => u.userId === s.userId);
        if (idx >= 0) {
          users[idx].name = updated.name;
          users[idx].email = updated.email;
          window.localStorage.setItem("echo.users", JSON.stringify(users));
        }
      }
      window.dispatchEvent(new CustomEvent("echo:auth", { detail: updated }));
      setSession(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      /* ignore quota / parse errors */
    }
  };

  const signOut = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("echo.session");
      window.location.href = "/login";
    }
  };

  if (!session) {
    return (
      <div className="page-container py-10">
        <div className="mb-8">
          <p className="text-caption text-obsidian/50 mb-2">Account</p>
          <h1 className="text-display-md font-bold">Settings</h1>
        </div>
        <FeatureCard surface="paper-white" padding="lg" className="hairline text-center">
          <p className="text-body text-obsidian/60 mb-4">
            Sign in to view your account settings.
          </p>
          <Button variant="light" size="md" href="/login">
            Sign in
          </Button>
        </FeatureCard>
      </div>
    );
  }

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
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-iron text-body-sm focus:outline-none focus:border-obsidian"
                />
              </div>
              <div>
                <label className="text-caption font-medium block mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-iron text-body-sm focus:outline-none focus:border-obsidian"
                />
              </div>
              <div>
                <label className="text-caption font-medium block mb-1">Workspace</label>
                <input
                  type="text"
                  value={workspace}
                  onChange={(e) => setWorkspace(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-iron text-body-sm focus:outline-none focus:border-obsidian"
                />
              </div>
              <div>
                <label className="text-caption font-medium block mb-1">Timezone</label>
                <input
                  type="text"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  placeholder="e.g. Asia/Kolkata (IST)"
                  className="w-full px-3 py-2 rounded-lg border border-iron text-body-sm focus:outline-none focus:border-obsidian"
                />
              </div>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <Button variant="light" size="sm" onClick={save}>
                Save
              </Button>
              {saved && (
                <span className="text-caption text-emerald-600 font-medium">Saved ✓</span>
              )}
            </div>
          </FeatureCard>

          <FeatureCard surface="paper-white" padding="lg" className="hairline">
            <h2 className="text-heading-sm font-bold mb-4">Notifications</h2>
            <div className="space-y-3">
              {NOTIFICATIONS.map((n) => (
                <div key={n.key} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-body-sm font-medium">{n.label}</p>
                    <p className="text-caption text-obsidian/50">{n.channel}</p>
                  </div>
                  <button
                    className={`w-11 h-6 rounded-full transition-colors ${
                      n.on ? "bg-obsidian" : "bg-pewter"
                    }`}
                    aria-label={`Toggle ${n.label}`}
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
                <p className="text-caption text-obsidian/50 mb-2">
                  How long Echo keeps screen recordings after a skill is learned.
                </p>
                <select className="px-3 py-2 rounded-lg border border-iron text-body-sm bg-paper-white">
                  <option>7 days (recommended)</option>
                  <option>30 days</option>
                  <option>90 days</option>
                  <option>Never delete</option>
                </select>
              </div>
              <div>
                <p className="text-body-sm font-medium">Export data</p>
                <p className="text-caption text-obsidian/50 mb-2">
                  Download all your skills, runs, and recordings.
                </p>
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
            <h3 className="text-caption font-medium uppercase opacity-60 mb-3">Account</h3>
            <p className="text-body-sm mb-2">
              Signed in as <strong>{session.email}</strong>
            </p>
            <p className="text-caption text-obsidian/50 mb-4">
              Session opened {new Date(session.signedInAt).toLocaleString()}
            </p>
            <Button variant="outline-light" size="sm" className="w-full" onClick={signOut}>
              Sign out
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
