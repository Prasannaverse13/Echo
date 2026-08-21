"use client";

import * as React from "react";
import { FeatureTag, FeatureCard } from "@/components/ui";

const initialLogs = [
  { ts: "11:42:33.241", level: "info", agent: "rfp-responder", msg: "Spawned sub-agent for input #234" },
  { ts: "11:42:33.502", level: "action", agent: "rfp-responder", msg: "Calling gemini-2.5-flash (vision) for PDF parse" },
  { ts: "11:42:34.812", level: "success", agent: "rfp-responder", msg: "Extracted 23 questions, 5 high-confidence matches" },
  { ts: "11:42:35.103", level: "info", agent: "inbox-butler", msg: "Picked up 3 new emails" },
  { ts: "11:42:35.401", level: "success", agent: "inbox-butler", msg: "Drafted 2 replies, scheduled 1 meeting" },
  { ts: "11:42:36.022", level: "info", agent: "lead-enricher", msg: "Processing batch of 12 leads" },
  { ts: "11:42:37.901", level: "warn", agent: "rfp-responder", msg: "Q3 'Pricing for 500 seats' — no high-confidence match, flagged for review" },
];

const levelStyles = {
  info: "text-paper-white/60",
  success: "text-emerald-400",
  warn: "text-amber-400",
  action: "text-sky-300",
  error: "text-red-400",
};

export default function LogsPage() {
  const [filter, setFilter] = React.useState<"all" | "info" | "success" | "warn" | "action">("all");
  const [autoScroll, setAutoScroll] = React.useState(true);

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
        <div className="flex gap-2">
          {(["all", "info", "success", "warn", "action"] as const).map((l) => (
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
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-paper-white/10">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-paper-white/80">Streaming · 3 active agents</span>
          </div>
          <div className="flex items-center gap-3 text-paper-white/50">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="accent-paper-white"
              />
              Auto-scroll
            </label>
          </div>
        </div>
        <div className="space-y-1 max-h-[600px] overflow-y-auto">
          {initialLogs
            .filter((l) => filter === "all" || l.level === filter)
            .map((log, i) => (
              <div key={i} className="flex gap-3 hover:bg-paper-white/5 px-2 py-1 -mx-2 rounded">
                <span className="text-paper-white/30 tabular-nums shrink-0">
                  {log.ts}
                </span>
                <span className={`w-16 shrink-0 ${levelStyles[log.level as keyof typeof levelStyles]}`}>
                  {log.level.toUpperCase()}
                </span>
                <span className="text-slate-teal shrink-0">[{log.agent}]</span>
                <span className="text-paper-white/80">{log.msg}</span>
              </div>
            ))}
          <div className="flex gap-3 px-2 py-1 text-paper-white/40">
            <span className="tabular-nums">11:42:38.112</span>
            <span className="animate-pulse">▍</span>
          </div>
        </div>
      </FeatureCard>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <FeatureCard surface="paper-white" padding="md" className="hairline">
          <p className="text-caption text-obsidian/50 mb-1">Events / sec</p>
          <p className="text-heading-sm font-bold tabular-nums">12.4</p>
        </FeatureCard>
        <FeatureCard surface="paper-white" padding="md" className="hairline">
          <p className="text-caption text-obsidian/50 mb-1">Today</p>
          <p className="text-heading-sm font-bold tabular-nums">41,827</p>
        </FeatureCard>
        <FeatureCard surface="paper-white" padding="md" className="hairline">
          <p className="text-caption text-obsidian/50 mb-1">Errors</p>
          <p className="text-heading-sm font-bold tabular-nums">0.02%</p>
        </FeatureCard>
        <FeatureCard surface="paper-white" padding="md" className="hairline">
          <p className="text-caption text-obsidian/50 mb-1">p99 latency</p>
          <p className="text-heading-sm font-bold tabular-nums">4m 12s</p>
        </FeatureCard>
      </div>
    </div>
  );
}
