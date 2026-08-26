"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";
import { listSkills, type SkillRecord } from "@/lib/client/stores";

type DemoSkill = {
  id: string;
  name: string;
  description: string;
  color: "dusty-sky" | "wisteria" | "desert-clay" | "mist-mint";
  trigger: string;
  runs: number;
  success: number;
  lastRun: string;
  integrations: string[];
};

const demoSkills: DemoSkill[] = [
  {
    id: "rfp-response",
    name: "RFP Response Drafting",
    description: "Reads RFP PDFs and drafts answers from your knowledge vault.",
    color: "dusty-sky",
    trigger: "New PDF in Drive/RFPs",
    runs: 47,
    success: 95,
    lastRun: "2h ago",
    integrations: ["Drive", "Gmail", "Sheets"],
  },
  {
    id: "inbox-triage",
    name: "Inbox Triage",
    description: "Sorts, drafts replies, schedules meetings from your inbox.",
    color: "wisteria",
    trigger: "Every 15 min / New email",
    runs: 124,
    success: 98,
    lastRun: "5m ago",
    integrations: ["Gmail", "Calendar"],
  },
  {
    id: "pdf-sheets",
    name: "PDF → Sheets",
    description: "Extracts tabular data from PDFs into Google Sheets rows.",
    color: "desert-clay",
    trigger: "New PDF in Drive/Invoices",
    runs: 32,
    success: 100,
    lastRun: "1d ago",
    integrations: ["Drive", "Sheets"],
  },
  {
    id: "weekly-report",
    name: "Weekly Report Generator",
    description: "Pulls metrics, drafts a summary, posts to Slack.",
    color: "mist-mint",
    trigger: "Schedule · Mon 9am",
    runs: 8,
    success: 100,
    lastRun: "4d ago",
    integrations: ["Sheets", "Slack"],
  },
  {
    id: "lead-enricher",
    name: "LinkedIn Lead Enricher",
    description: "Enriches HubSpot leads with LinkedIn data and writes notes.",
    color: "dusty-sky",
    trigger: "Webhook from HubSpot",
    runs: 156,
    success: 92,
    lastRun: "12m ago",
    integrations: ["HubSpot", "LinkedIn"],
  },
  {
    id: "social-scheduler",
    name: "Social Media Scheduler",
    description: "Reformats blog posts into platform-specific social copy.",
    color: "wisteria",
    trigger: "New post in Ghost",
    runs: 23,
    success: 100,
    lastRun: "3d ago",
    integrations: ["Ghost", "Twitter", "LinkedIn"],
  },
];

const userColors: DemoSkill["color"][] = [
  "dusty-sky",
  "wisteria",
  "desert-clay",
  "mist-mint",
];

function getUserId(): string {
  if (typeof window === "undefined") return "anon";
  try {
    const session = window.localStorage.getItem("echo.session");
    if (session) {
      const parsed = JSON.parse(session);
      if (parsed?.email) return parsed.email;
    }
  } catch {
    /* ignore */
  }
  return "anon";
}

function fmtRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "just now";
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function toCard(s: SkillRecord): DemoSkill {
  return {
    id: s.id,
    name: s.name,
    description: s.description,
    color: (s.color as DemoSkill["color"]) || userColors[0],
    trigger: s.trigger || "Manual",
    runs: 0,
    success: 0,
    lastRun: fmtRelative(s.createdAt),
    integrations: (s.integrations || []).slice(0, 4),
  };
}

type FilterId = "all" | "recent" | "auto" | "needs-review";

export default function SkillsPage() {
  const [userSkills, setUserSkills] = useState<DemoSkill[]>([]);
  const [filter, setFilter] = useState<FilterId>("all");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const userId = getUserId();
      const all = listSkills(userId);
      setUserSkills(all.map(toCard));
    } catch {
      // ignore
    } finally {
      setHydrated(true);
    }
    // refresh if a skill was just saved in another tab
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key.startsWith("echo.skills.")) {
        try {
          const userId = getUserId();
          const all = listSkills(userId);
          setUserSkills(all.map(toCard));
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const all = useMemo(
    () => [...userSkills, ...demoSkills],
    [userSkills]
  );

  const visible = useMemo(() => {
    if (filter === "all") return all;
    if (filter === "recent") {
      // demo skills have no createdAt; user skills do. Sort by recency
      // when "Recent" is selected.
      return [...all].sort((a, b) => {
        const aT = (userSkills.find((s) => s.id === a.id) as unknown as { createdAt?: string })?.createdAt;
        const bT = (userSkills.find((s) => s.id === b.id) as unknown as { createdAt?: string })?.createdAt;
        if (aT && bT) return bT.localeCompare(aT);
        if (aT) return -1;
        if (bT) return 1;
        return 0;
      });
    }
    if (filter === "auto") {
      // Auto-generated = source: "recorder" or "manual"
      return all.filter((s) => userSkills.some((u) => u.id === s.id));
    }
    if (filter === "needs-review") {
      // Demo placeholders — none "needs review" in the demo data.
      // User skills with no integrations are flagged for review.
      return all.filter((s) => {
        const isUser = userSkills.find((u) => u.id === s.id);
        return isUser && s.integrations.length === 0;
      });
    }
    return all;
  }, [all, filter, userSkills]);

  const totalSkills = all.length;
  const userCount = userSkills.length;
  const lifetimeRuns = demoSkills.reduce((acc, s) => acc + s.runs, 0);
  const successSum = demoSkills.reduce(
    (acc, s) => acc + s.runs * s.success,
    0
  );
  const avgSuccess =
    lifetimeRuns > 0 ? Math.round((successSum / lifetimeRuns) * 10) / 10 : 0;

  return (
    <div className="page-container py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div>
          <p className="text-caption text-obsidian/50 mb-2">Library</p>
          <h1 className="text-display-md font-bold">Your skills</h1>
          <p className="mt-2 text-body text-obsidian/70">
            {hydrated ? (
              <>
                {totalSkills} skill{totalSkills === 1 ? "" : "s"}
                {userCount > 0 && (
                  <>
                    {" "}
                    <span className="text-obsidian/50">
                      ({userCount} yours · {demoSkills.length} demo)
                    </span>
                  </>
                )}
                {" · "}
                {lifetimeRuns} lifetime runs · {avgSuccess}% success
              </>
            ) : (
              "Loading your library…"
            )}
          </p>
        </div>
        <Link href="/record">
          <Button variant="light" size="md">
            ◉ Record new skill
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-8">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label={`All · ${totalSkills}`}
        />
        <FilterChip
          active={filter === "recent"}
          onClick={() => setFilter("recent")}
          label="Recent"
        />
        <FilterChip
          active={filter === "auto"}
          onClick={() => setFilter("auto")}
          label={`Auto-generated${userCount > 0 ? ` · ${userCount}` : ""}`}
        />
        <FilterChip
          active={filter === "needs-review"}
          onClick={() => setFilter("needs-review")}
          label="Needs review"
        />
      </div>

      {/* Empty state for user-skill filters */}
      {hydrated && visible.length === 0 && (
        <div className="text-center py-16 text-obsidian/60">
          <p className="text-body">
            {filter === "auto"
              ? "No skills you created yet."
              : filter === "needs-review"
                ? "Nothing needs review right now."
                : "No skills to show."}
          </p>
          {filter === "auto" && (
            <Link
              href="/record"
              className="inline-block mt-4 px-4 py-2 rounded-lg bg-obsidian text-paper-white text-body-sm font-medium hover:bg-obsidian/90"
            >
              ◉ Record your first skill
            </Link>
          )}
        </div>
      )}

      {/* Skills grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {visible.map((skill) => {
          const isUser = userSkills.some((u) => u.id === skill.id);
          return (
            <Link
              key={skill.id}
              href={`/skills/${skill.id}`}
              className="group block"
            >
              <FeatureCard
                surface={skill.color}
                padding="lg"
                className="h-full transition-transform group-hover:-translate-y-1"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-1.5">
                    <FeatureTag variant="obsidian">
                      {isUser ? "Yours" : "Skill"}
                    </FeatureTag>
                    {isUser && (
                      <FeatureTag variant="iron">New</FeatureTag>
                    )}
                  </div>
                  <span className="text-caption opacity-60 tabular-nums">
                    {skill.runs > 0 ? `${skill.runs} runs` : "—"}
                  </span>
                </div>
                <h3 className="text-heading-sm font-bold mb-2">{skill.name}</h3>
                <p className="text-body-sm mb-4 opacity-80">
                  {skill.description}
                </p>

                <div className="space-y-2 text-caption">
                  <div className="flex items-center gap-2">
                    <span className="opacity-60">Trigger:</span>
                    <span className="font-medium">{skill.trigger}</span>
                  </div>
                  {skill.runs > 0 && (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="opacity-60">Success:</span>
                        <span className="font-bold tabular-nums">
                          {skill.success}%
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="opacity-60">
                      {isUser ? "Created:" : "Last run:"}
                    </span>
                    <span className="font-medium">{skill.lastRun}</span>
                  </div>
                </div>

                {skill.integrations.length > 0 && (
                  <div className="mt-5 pt-4 border-t border-obsidian/10 flex flex-wrap gap-1.5">
                    {skill.integrations.map((i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md bg-obsidian/8 text-caption font-medium"
                      >
                        {i}
                      </span>
                    ))}
                  </div>
                )}
              </FeatureCard>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center px-3 py-1.5 rounded-full text-caption font-medium transition-colors " +
        (active
          ? "bg-obsidian text-paper-white"
          : "bg-iron/20 text-obsidian/70 hover:bg-iron/30")
      }
    >
      {label}
    </button>
  );
}
