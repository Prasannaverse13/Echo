"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";
import { getSession } from "@/lib/auth/auth";
import {
  getUserId,
  listAgents,
  listRuns,
  type AgentRecord,
  type RunRecord,
} from "@/lib/client/stores";

function getFirstName(name: string | undefined): string {
  if (!name) return "there";
  const first = name.trim().split(/\s+/)[0] || "there";
  const clean = first.replace(/[^A-Za-z\u00C0-\u024F'-]/g, "").slice(0, 24);
  return clean || first || "there";
}

export default function DashboardPage() {
  const userId = useMemo(getUserId, []);
  const [firstName, setFirstName] = useState<string>("there");
  const [agents, setAgents] = useState<AgentRecord[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const s = getSession();
    setFirstName(getFirstName(s?.name));
  }, []);

  // Live refresh from localStorage so the dashboard shows fresh
  // numbers as new runs stream in.
  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      setAgents(listAgents(userId));
      setRuns(listRuns(userId));
    };
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [userId]);

  // Tick every minute so "Today" / "Last 30 days" roll over.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Real metrics from the user's local data
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const thirtyAgo = now - 30 * 24 * 60 * 60 * 1000;
  const runsToday = runs.filter((r) => new Date(r.startedAt) >= todayStart).length;
  const runsYesterday = runs.filter((r) => {
    const d = new Date(r.startedAt);
    return d >= new Date(todayStart.getTime() - 24 * 60 * 60 * 1000) && d < todayStart;
  }).length;
  const runs30d = runs.filter((r) => new Date(r.startedAt).getTime() >= thirtyAgo).length;
  const success30d = runs.filter(
    (r) => r.status === "completed" && new Date(r.startedAt).getTime() >= thirtyAgo
  ).length;
  const successRate = runs30d === 0 ? null : (success30d / runs30d) * 100;
  const activeRuns = runs.filter(
    (r) => r.status === "running" || r.status === "queued"
  );
  const realActions30d = runs
    .filter((r) => new Date(r.startedAt).getTime() >= thirtyAgo)
    .reduce((s, r) => s + (r.actions ?? []).filter((a) => a.real).length, 0);

  // Most recent 3 agents (by createdAt)
  const recentAgents = [...agents]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);

  // Most recent 3 runs (by startedAt)
  const recentRuns = [...runs]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .slice(0, 3);

  return (
    <div className="page-container py-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <p className="text-caption text-obsidian/50 mb-2">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <h1 className="text-[44px] md:text-[56px] font-bold leading-[1.1] tracking-[-0.04em] text-obsidian">
            Welcome back, {firstName}.
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

      {/* Hero metrics — live from localStorage, not hardcoded */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
        <FeatureCard surface="paper-white" padding="md" className="hairline">
          <p className="text-caption text-obsidian/50 mb-1">Agents</p>
          <p className="text-display-md font-bold tabular-nums">{agents.length}</p>
          <p className="text-caption text-obsidian/50 mt-1">
            {recentAgents.length === 0
              ? "Compose one to start"
              : `${recentAgents[0].name.slice(0, 24)}`}
          </p>
        </FeatureCard>
        <FeatureCard surface="paper-white" padding="md" className="hairline">
          <p className="text-caption text-obsidian/50 mb-1">Runs today</p>
          <p className="text-display-md font-bold tabular-nums">{runsToday}</p>
          <p className="text-caption text-obsidian/50 mt-1">
            {runsToday - runsYesterday >= 0 ? "+" : ""}
            {runsToday - runsYesterday} vs yesterday
          </p>
        </FeatureCard>
        <FeatureCard surface="paper-white" padding="md" className="hairline">
          <p className="text-caption text-obsidian/50 mb-1">In flight</p>
          <p className="text-display-md font-bold tabular-nums">{activeRuns.length}</p>
          <p className="text-caption text-obsidian/50 mt-1">
            {realActions30d > 0
              ? `${realActions30d} real headless action${realActions30d === 1 ? "" : "s"} (30d)`
              : "no real actions yet"}
          </p>
        </FeatureCard>
        <FeatureCard surface="paper-white" padding="md" className="hairline">
          <p className="text-caption text-obsidian/50 mb-1">Success rate</p>
          <p className="text-display-md font-bold tabular-nums">
            {successRate === null ? "—" : `${successRate.toFixed(1)}%`}
          </p>
          <p className="text-caption text-obsidian/50 mt-1">Last 30 days</p>
        </FeatureCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
        {/* Active agents */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-heading-sm font-bold">Recent agents</h2>
            <Link
              href="/agents"
              className="text-caption font-medium hover:underline underline-offset-4"
            >
              View all →
            </Link>
          </div>
          {recentAgents.length === 0 ? (
            <FeatureCard surface="paper-white" padding="md" className="hairline text-center">
              <p className="text-body-sm text-obsidian/60 mb-3">
                No agents yet. Dispatch one from the Composer.
              </p>
              <Link href="/compose">
                <Button variant="light" size="sm">
                  ❖ Compose an agent
                </Button>
              </Link>
            </FeatureCard>
          ) : (
            <div className="space-y-3">
              {recentAgents.map((agent) => {
                const linkedRuns = runs.filter((r) => r.agentId === agent.id);
                const lastRun = linkedRuns[0];
                const isRunning = lastRun?.status === "running";
                const pct =
                  lastRun?.status === "completed"
                    ? 100
                    : lastRun?.progress ?? 0;
                return (
                  <Link
                    key={agent.id}
                    href={`/agents/${agent.id}`}
                    className="block"
                  >
                    <FeatureCard
                      surface="paper-white"
                      padding="md"
                      className="hairline hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-body font-medium truncate">
                              {agent.name}
                            </h3>
                            <FeatureTag
                              variant={isRunning ? "desert-clay" : "mist-mint"}
                            >
                              {isRunning ? "◉ Running" : "✓ Idle"}
                            </FeatureTag>
                          </div>
                          <p className="text-caption text-obsidian/50 line-clamp-1 italic">
                            "{agent.goal.slice(0, 60)}{agent.goal.length > 60 ? "…" : ""}"
                          </p>
                          <div className="mt-3 flex items-center gap-3">
                            <div className="flex-1 h-1.5 bg-iron rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  pct === 100 ? "bg-slate-teal" : "bg-obsidian"
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-caption font-medium tabular-nums">
                              {linkedRuns.length} run{linkedRuns.length === 1 ? "" : "s"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </FeatureCard>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Recent runs panel */}
          {recentRuns.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-heading-sm font-bold">Recent runs</h2>
                <Link
                  href="/runs"
                  className="text-caption font-medium hover:underline underline-offset-4"
                >
                  View all →
                </Link>
              </div>
              <div className="space-y-2">
                {recentRuns.map((run) => {
                  const realCount = (run.actions ?? []).filter((a) => a.real).length;
                  return (
                    <Link
                      key={run.id}
                      href={`/runs/${run.id}`}
                      className="block"
                    >
                      <FeatureCard
                        surface="paper-white"
                        padding="md"
                        className="hairline hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-caption font-mono text-obsidian/60 truncate">
                              {run.id}
                            </p>
                            <p className="text-body-sm text-obsidian/80 line-clamp-1">
                              {run.goal ?? run.skillName ?? "(no goal)"}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="text-caption text-obsidian/50">
                              {run.status} · {run.progress}%
                            </p>
                            {realCount > 0 && (
                              <p className="text-[10px] text-obsidian/60 font-bold">
                                📸 {realCount} real
                              </p>
                            )}
                          </div>
                        </div>
                      </FeatureCard>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Side: quick links */}
        <div>
          <h2 className="text-heading-sm font-bold mb-4">Quick actions</h2>
          <div className="space-y-3">
            <Link href="/compose?demo=true" className="block">
              <FeatureCard surface="dusty-sky" padding="md" className="hover:shadow-md transition-shadow">
                <p className="text-caption font-medium uppercase opacity-60 mb-1">Demo</p>
                <p className="text-body-sm font-bold">▶ Run the demo</p>
                <p className="text-caption opacity-70 mt-1">
                  Auto-fill 4 composers, auto-dispatch, sit back.
                </p>
              </FeatureCard>
            </Link>
            <Link href="/integrations" className="block">
              <FeatureCard surface="wisteria" padding="md" className="hover:shadow-md transition-shadow">
                <p className="text-caption font-medium uppercase opacity-60 mb-1">Integrations</p>
                <p className="text-body-sm font-bold">🔌 Connect services</p>
                <p className="text-caption opacity-70 mt-1">
                  Google Drive, Gmail, Sheets, Telegram bot.
                </p>
              </FeatureCard>
            </Link>
            <Link href="/logs" className="block">
              <FeatureCard surface="desert-clay" padding="md" className="hover:shadow-md transition-shadow">
                <p className="text-caption font-medium uppercase opacity-60 mb-1">Observability</p>
                <p className="text-body-sm font-bold">📋 Live logs</p>
                <p className="text-caption opacity-70 mt-1">
                  OpenTelemetry-style event stream.
                </p>
              </FeatureCard>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
