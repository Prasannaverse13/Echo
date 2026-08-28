"use client";

import * as React from "react";
import { FeatureTag, FeatureCard } from "@/components/ui";
import {
  appendLog,
  clearLogs,
  getUserId,
  listLogs,
  listRuns,
  type LogRecord,
} from "@/lib/client/stores";

type Level = "info" | "success" | "warn" | "action" | "error";
const FILTERS: ("all" | Level)[] = ["all", "info", "success", "warn", "action", "error"];

const levelStyles: Record<Level, string> = {
  info: "text-paper-white/60",
  success: "text-emerald-400",
  warn: "text-amber-400",
  action: "text-sky-300",
  error: "text-red-400",
};

const TICK_INTERVAL_MS = 1500;
const SIM_TICK_MS = 1200;

function fmtTs(iso: string) {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

export default function LogsPage() {
  const userId = React.useMemo(getUserId, []);
  const [logs, setLogs] = React.useState<LogRecord[]>([]);
  const [filter, setFilter] = React.useState<"all" | Level>("all");
  const [autoScroll, setAutoScroll] = React.useState(true);
  const [paused, setPaused] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // Initial load
  React.useEffect(() => {
    setLogs(listLogs(userId));
  }, [userId]);

  // Polling
  React.useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      setLogs(listLogs(userId));
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [userId, paused]);

  // Simulated live events when there are runs in flight (or always at low rate)
  React.useEffect(() => {
    if (paused) return;
    const samples: Omit<LogRecord, "id" | "ts">[] = [
      { level: "info", agent: "system", msg: "Heartbeat: scheduler tick" },
      { level: "info", agent: "echo-manager", msg: "Scanning skill library for new patterns" },
      { level: "action", agent: "rfp-responder", msg: "Calling gemini-3.5-flash (vision) for PDF parse" },
      { level: "info", agent: "inbox-butler", msg: "Picked up new batch from Gmail" },
      { level: "success", agent: "inbox-butler", msg: "Drafted 3 replies, scheduled 1 meeting" },
      { level: "info", agent: "lead-enricher", msg: "Processing batch of 12 leads" },
      { level: "warn", agent: "rfp-responder", msg: "Q3 'Pricing for 500 seats' \u2014 no high-confidence match, flagged for review" },
      { level: "info", agent: "social-amplifier", msg: "Buffer queue depth: 7 drafts waiting" },
      { level: "action", agent: "weekly-reporter", msg: "Pulling metrics from Sheets/Metrics" },
      { level: "success", agent: "weekly-reporter", msg: "Posted weekly summary to #team" },
    ];
    const agents = ["rfp-responder", "inbox-butler", "lead-enricher", "social-amplifier", "weekly-reporter", "pdf-sheets", "echo-manager"];

    const id = setInterval(() => {
      const running = listRuns(userId).filter((r) => r.status === "running" || r.status === "queued");
      if (running.length === 0) return; // only emit when something is running
      const skillId = running[Math.floor(Math.random() * running.length)].skillId;
      const agent = agents[Math.floor(Math.random() * agents.length)];
      const sample = samples[Math.floor(Math.random() * samples.length)];
      appendLog(userId, { ...sample, agent, scope: skillId, msg: `[${skillId}] ${sample.msg}` });
    }, SIM_TICK_MS);
    return () => clearInterval(id);
  }, [userId, paused]);

  // Auto-scroll
  React.useEffect(() => {
    if (!autoScroll || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [logs, autoScroll]);

  // Derive live stats
  const stats = React.useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayCount = logs.filter((l) => new Date(l.ts) >= todayStart).length;
    const errorCount = logs.filter((l) => l.level === "error").length;
    const totalCount = logs.length;
    const errorRate = totalCount === 0 ? 0 : (errorCount / totalCount) * 100;
    // Events / sec: last 60s
    const sixtyAgo = Date.now() - 60_000;
    const recent = logs.filter((l) => new Date(l.ts).getTime() >= sixtyAgo).length;
    return { todayCount, errorCount, errorRate, eps: recent / 60 };
  }, [logs]);

  const visible = logs.filter((l) => filter === "all" || l.level === filter);
  const activeAgents = new Set(logs.slice(-50).map((l) => l.agent)).size;

  return (
    <div className="page-container py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <p className="text-caption text-obsidian/50 mb-2">Observability</p>
          <h1 className="text-display-md font-bold">Live logs</h1>
          <p className="mt-2 text-body text-obsidian/70">
            OpenTelemetry-compliant stream across all agents
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((l) => (
            <button
              key={l}
              onClick={() => setFilter(l)}
              className={`px-3 py-1.5 rounded-full text-caption font-medium transition-colors ${
                filter === l ? "bg-obsidian text-paper-white" : "bg-bone text-obsidian"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      <FeatureCard surface="obsidian" padding="md" className="font-mono text-caption mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-paper-white/10">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${paused ? "bg-pewter" : "bg-emerald-400 animate-pulse"}`} />
            <span className="text-paper-white/80">
              {paused ? "Paused" : "Streaming"} · {activeAgents} active agent{activeAgents === 1 ? "" : "s"}
            </span>
          </div>
          <div className="flex items-center gap-4 text-paper-white/50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="accent-paper-white"
              />
              Auto-scroll
            </label>
            <button
              onClick={() => setPaused((p) => !p)}
              className="px-2 py-1 rounded-md hover:bg-paper-white/10 transition-colors"
            >
              {paused ? "▶ Resume" : "⏸ Pause"}
            </button>
            <button
              onClick={() => {
                if (confirm("Clear all logs?")) clearLogs(userId);
              }}
              className="px-2 py-1 rounded-md hover:bg-paper-white/10 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
        <div ref={scrollRef} className="space-y-1 max-h-[600px] overflow-y-auto">
          {visible.length === 0 ? (
            <div className="text-paper-white/40 italic">
              {logs.length === 0
                ? "No logs yet. Start a run from the Skills or Composer page to see events stream in."
                : "No logs match this filter."}
            </div>
          ) : (
            visible.slice(-300).map((log) => (
              <div key={log.id} className="flex gap-3 hover:bg-paper-white/5 px-2 py-1 -mx-2 rounded">
                <span className="text-paper-white/30 tabular-nums shrink-0">
                  {fmtTs(log.ts)}
                </span>
                <span
                  className={`w-16 shrink-0 ${
                    levelStyles[log.level as Level] ?? levelStyles.info
                  }`}
                >
                  {log.level.toUpperCase()}
                </span>
                <span className="text-slate-teal shrink-0">[{log.agent}]</span>
                <span className="text-paper-white/80 break-words">{log.msg}</span>
              </div>
            ))
          )}
          {!paused && (
            <div className="flex gap-3 px-2 py-1 text-paper-white/40">
              <span className="tabular-nums">{fmtTs(new Date().toISOString())}</span>
              <span className="animate-pulse">▍</span>
            </div>
          )}
        </div>
      </FeatureCard>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FeatureCard surface="paper-white" padding="md" className="hairline">
          <p className="text-caption text-obsidian/50 mb-1">Events / sec</p>
          <p className="text-heading-sm font-bold tabular-nums">{stats.eps.toFixed(1)}</p>
        </FeatureCard>
        <FeatureCard surface="paper-white" padding="md" className="hairline">
          <p className="text-caption text-obsidian/50 mb-1">Today</p>
          <p className="text-heading-sm font-bold tabular-nums">{stats.todayCount.toLocaleString()}</p>
        </FeatureCard>
        <FeatureCard surface="paper-white" padding="md" className="hairline">
          <p className="text-caption text-obsidian/50 mb-1">Errors</p>
          <p className="text-heading-sm font-bold tabular-nums">{stats.errorRate.toFixed(2)}%</p>
        </FeatureCard>
        <FeatureCard surface="paper-white" padding="md" className="hairline">
          <p className="text-caption text-obsidian/50 mb-1">Total buffered</p>
          <p className="text-heading-sm font-bold tabular-nums">{logs.length.toLocaleString()}</p>
        </FeatureCard>
      </div>
    </div>
  );
}
