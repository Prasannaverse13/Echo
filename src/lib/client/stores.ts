"use client";

/**
 * Browser-side stores for runs / logs / triggers / agents.
 *
 * When GCP is enabled on the backend, these stores still cache locally for
 * instant render and then revalidate from the API. When GCP is disabled
 * (demo mode), the same stores are the source of truth — every action the
 * user takes writes here, the dashboard reads from here, and the whole
 * product feels fully functional end-to-end without a server.
 *
 * Storage keys are namespaced so multiple Echo tabs / users don't collide.
 */

const NS = (userId: string, key: string) => `echo.${userId}.${key}`;

export interface RunRecord {
  id: string;
  skillId: string;
  skillName?: string;
  agentId?: string;
  goal?: string;
  inputs: Array<{ id: string; payload: unknown }>;
  totalInputs: number;
  status: "queued" | "running" | "completed" | "failed" | "review";
  progress: number;
  startedAt: string;
  finishedAt?: string;
  durationSec?: number;
  message?: string;
  gcp?: "connected" | "disabled";
}

export interface LogRecord {
  id: string;
  ts: string; // ISO timestamp
  level: "info" | "success" | "warn" | "action" | "error";
  agent: string; // skillId or agentId
  scope?: string; // runId this log belongs to, if any
  msg: string;
}

export interface TriggerRecord {
  id: string;
  name: string;
  type: "Event" | "Schedule" | "Webhook" | "Manual";
  skillId: string;
  skillName?: string;
  status: "active" | "paused";
  lastFired?: string;
  schedule?: string;
  createdAt: string;
}

export interface SkillRecord {
  id: string;
  name: string;
  description: string;
  color: "dusty-sky" | "wisteria" | "desert-clay" | "mist-mint";
  trigger: string;
  steps: Array<{ num: number; title: string; detail: string; at: string }>;
  createdAt: string;
  source: "recorder" | "composer" | "seed";
}

export interface AgentRecord {
  id: string;
  name: string;
  goal: string;
  subtasks: Array<{
    num: number;
    title: string;
    matchedSkill: string;
    parallel: boolean;
    estTime: string;
  }>;
  totalEstTime: string;
  totalEstCost: string;
  reasoning: string;
  status: "planning" | "active" | "paused" | "archived";
  createdAt: string;
  nextRun?: string;
  triggerId?: string;
}

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent(`echo:store:${key.split(".").pop()}`, { detail: value }));
  } catch {
    /* ignore quota errors */
  }
}

/* ------------------------------------------------------------------ */
/* Runs                                                                */
/* ------------------------------------------------------------------ */

const RUNS_KEY = "runs";

export function listRuns(userId: string): RunRecord[] {
  return readArray<RunRecord>(NS(userId, RUNS_KEY)).sort((a, b) =>
    b.startedAt.localeCompare(a.startedAt)
  );
}

export function getRun(userId: string, id: string): RunRecord | undefined {
  return listRuns(userId).find((r) => r.id === id);
}

export function saveRun(userId: string, run: RunRecord) {
  const all = listRuns(userId);
  const idx = all.findIndex((r) => r.id === run.id);
  if (idx >= 0) all[idx] = run;
  else all.unshift(run);
  // Keep last 200 runs to avoid localStorage bloat
  writeArray(NS(userId, RUNS_KEY), all.slice(0, 200));
}

export function updateRun(
  userId: string,
  id: string,
  patch: Partial<RunRecord>
) {
  const existing = getRun(userId, id);
  if (!existing) return;
  saveRun(userId, { ...existing, ...patch });
}

export function clearRuns(userId: string) {
  writeArray(NS(userId, RUNS_KEY), []);
}

/* ------------------------------------------------------------------ */
/* Logs                                                                 */
/* ------------------------------------------------------------------ */

const LOGS_KEY = "logs";
const MAX_LOGS = 500;

export function listLogs(userId: string): LogRecord[] {
  return readArray<LogRecord>(NS(userId, LOGS_KEY));
}

export function appendLog(userId: string, entry: Omit<LogRecord, "id" | "ts"> & { ts?: string }) {
  const all = listLogs(userId);
  const record: LogRecord = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ts: entry.ts ?? new Date().toISOString(),
    level: entry.level,
    agent: entry.agent,
    scope: entry.scope,
    msg: entry.msg,
  };
  all.push(record);
  if (all.length > MAX_LOGS) all.splice(0, all.length - MAX_LOGS);
  writeArray(NS(userId, LOGS_KEY), all);
}

export function clearLogs(userId: string) {
  writeArray(NS(userId, LOGS_KEY), []);
}

/* ------------------------------------------------------------------ */
/* Triggers                                                             */
/* ------------------------------------------------------------------ */

const TRIGGERS_KEY = "triggers";

export function listTriggers(userId: string): TriggerRecord[] {
  return readArray<TriggerRecord>(NS(userId, TRIGGERS_KEY));
}

export function saveTrigger(userId: string, t: TriggerRecord) {
  const all = listTriggers(userId);
  const idx = all.findIndex((x) => x.id === t.id);
  if (idx >= 0) all[idx] = t;
  else all.unshift(t);
  writeArray(NS(userId, TRIGGERS_KEY), all);
}

export function deleteTrigger(userId: string, id: string) {
  writeArray(
    NS(userId, TRIGGERS_KEY),
    listTriggers(userId).filter((t) => t.id !== id)
  );
}

/* ------------------------------------------------------------------ */
/* Agents                                                               */
/* ------------------------------------------------------------------ */

const AGENTS_KEY = "agents";

export function listAgents(userId: string): AgentRecord[] {
  return readArray<AgentRecord>(NS(userId, AGENTS_KEY));
}

export function getAgent(userId: string, id: string): AgentRecord | undefined {
  return listAgents(userId).find((a) => a.id === id);
}

export function saveAgent(userId: string, agent: AgentRecord) {
  const all = listAgents(userId);
  const idx = all.findIndex((a) => a.id === agent.id);
  if (idx >= 0) all[idx] = agent;
  else all.unshift(agent);
  writeArray(NS(userId, AGENTS_KEY), all);
}

export function deleteAgent(userId: string, id: string) {
  writeArray(
    NS(userId, AGENTS_KEY),
    listAgents(userId).filter((a) => a.id !== id)
  );
}

/* ------------------------------------------------------------------ */
/* Skills                                                               */
/* ------------------------------------------------------------------ */

const SKILLS_KEY = "skills";

export function listSkills(userId: string): SkillRecord[] {
  return readArray<SkillRecord>(NS(userId, SKILLS_KEY));
}

export function saveSkillToStore(userId: string, skill: SkillRecord) {
  const all = listSkills(userId);
  const idx = all.findIndex((s) => s.id === skill.id);
  if (idx >= 0) all[idx] = skill;
  else all.unshift(skill);
  writeArray(NS(userId, SKILLS_KEY), all);
}

export function deleteSkillFromStore(userId: string, id: string) {
  writeArray(
    NS(userId, SKILLS_KEY),
    listSkills(userId).filter((s) => s.id !== id)
  );
}

/* ------------------------------------------------------------------ */
/* User id                                                              */
/* ------------------------------------------------------------------ */

export function getUserId(): string {
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
