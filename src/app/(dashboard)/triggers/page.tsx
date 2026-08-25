"use client";

import * as React from "react";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";
import {
  deleteTrigger,
  getUserId,
  listTriggers,
  saveTrigger,
  type TriggerRecord,
} from "@/lib/client/stores";

const triggerTypes: TriggerRecord["type"][] = ["Event", "Schedule", "Webhook", "Manual"];

function newId(): string {
  return `trg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export default function TriggersPage() {
  const userId = React.useMemo(getUserId, []);
  const [triggers, setTriggers] = React.useState<TriggerRecord[]>([]);
  const [showNew, setShowNew] = React.useState(false);

  // Initial load
  React.useEffect(() => {
    setTriggers(listTriggers(userId));
  }, [userId]);

  // Listen for store updates
  React.useEffect(() => {
    const refresh = () => setTriggers(listTriggers(userId));
    window.addEventListener("echo:store:triggers", refresh as EventListener);
    return () => window.removeEventListener("echo:store:triggers", refresh as EventListener);
  }, [userId]);

  const toggle = (t: TriggerRecord) => {
    saveTrigger(userId, { ...t, status: t.status === "active" ? "paused" : "active" });
  };
  const remove = (t: TriggerRecord) => {
    if (confirm(`Delete trigger "${t.name}"?`)) deleteTrigger(userId, t.id);
  };

  const active = triggers.filter((t) => t.status === "active").length;
  const paused = triggers.filter((t) => t.status === "paused").length;

  return (
    <div className="page-container py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <p className="text-caption text-obsidian/50 mb-2">Automation</p>
          <h1 className="text-display-md font-bold">Triggers</h1>
          <p className="mt-2 text-body text-obsidian/70 tabular-nums">
            {active} active · {paused} paused
          </p>
        </div>
        <Button variant="light" size="md" onClick={() => setShowNew(true)}>
          + New trigger
        </Button>
      </div>

      {triggers.length === 0 ? (
        <FeatureCard surface="paper-white" padding="lg" className="hairline text-center">
          <p className="text-body text-obsidian/60 mb-4">
            No triggers yet. Create your first one to fire a skill on a schedule, an event, or a webhook.
          </p>
          <Button variant="light" size="md" onClick={() => setShowNew(true)}>
            + New trigger
          </Button>
        </FeatureCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {triggers.map((t) => (
            <FeatureCard
              key={t.id}
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
              </div>
              <div className="space-y-1 text-caption text-obsidian/60 mb-4">
                <p>
                  Runs: <span className="font-medium text-obsidian">{t.skillName ?? t.skillId}</span>
                </p>
                {t.schedule && (
                  <p>
                    Schedule: <span className="font-medium text-obsidian">{t.schedule}</span>
                  </p>
                )}
                <p>Last fired: {t.lastFired ?? "—"}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline-light" size="sm" onClick={() => toggle(t)}>
                  {t.status === "active" ? "Pause" : "Resume"}
                </Button>
                <Button variant="outline-light" size="sm" onClick={() => remove(t)}>
                  Delete
                </Button>
              </div>
            </FeatureCard>
          ))}
        </div>
      )}

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

      {showNew && <NewTriggerModal onClose={() => setShowNew(false)} userId={userId} />}
    </div>
  );
}

function NewTriggerModal({ onClose, userId }: { onClose: () => void; userId: string }) {
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<TriggerRecord["type"]>("Schedule");
  const [schedule, setSchedule] = React.useState("Every Monday 9am");
  const [skillId, setSkillId] = React.useState("");

  function save() {
    if (!name.trim()) return;
    saveTrigger(userId, {
      id: newId(),
      name: name.trim(),
      type,
      skillId: skillId.trim() || "default",
      skillName: skillId.trim() || undefined,
      status: "active",
      lastFired: "—",
      schedule: type === "Schedule" ? schedule : undefined,
      createdAt: new Date().toISOString(),
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FeatureCard surface="paper-white" padding="lg" className="hairline w-full max-w-md">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-heading-sm font-bold">New trigger</h2>
          <button
            onClick={onClose}
            className="text-obsidian/40 hover:text-obsidian text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="space-y-3">
          <label className="block">
            <span className="text-caption font-medium uppercase opacity-60 mb-1 block">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Weekly lead pipeline"
              className="w-full px-3 py-2 rounded-xl border border-iron bg-paper-white text-body-sm focus:outline-none focus:border-obsidian"
              autoFocus
            />
          </label>
          <label className="block">
            <span className="text-caption font-medium uppercase opacity-60 mb-1 block">Type</span>
            <div className="flex flex-wrap gap-2">
              {triggerTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded-full text-caption font-medium transition-colors ${
                    type === t ? "bg-obsidian text-paper-white" : "bg-bone text-obsidian"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </label>
          {type === "Schedule" && (
            <label className="block">
              <span className="text-caption font-medium uppercase opacity-60 mb-1 block">Schedule</span>
              <input
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="Every Monday 9am"
                className="w-full px-3 py-2 rounded-xl border border-iron bg-paper-white text-body-sm focus:outline-none focus:border-obsidian"
              />
            </label>
          )}
          <label className="block">
            <span className="text-caption font-medium uppercase opacity-60 mb-1 block">Skill / Agent id</span>
            <input
              value={skillId}
              onChange={(e) => setSkillId(e.target.value)}
              placeholder="rfp-response, agent_abc, ..."
              className="w-full px-3 py-2 rounded-xl border border-iron bg-paper-white text-body-sm font-mono focus:outline-none focus:border-obsidian"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline-light" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="light" size="sm" onClick={save} disabled={!name.trim()}>
            Create trigger
          </Button>
        </div>
      </FeatureCard>
    </div>
  );
}
