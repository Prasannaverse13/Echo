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

export interface BrowserAction {
  /** ISO timestamp of when the action was performed. */
  ts: string;
  /** "navigate" | "click" | "type" | "extract" | "save" — semantic kind. */
  kind: "navigate" | "click" | "type" | "extract" | "save" | "think";
  /** URL the agent is on, if any (for navigate/click/extract). */
  url?: string;
  /** Short human-readable label, e.g. "Open HubSpot" or "Click 'New Lead'". */
  label: string;
  /** Optional free-form detail, e.g. what was extracted or typed. */
  detail?: string;
  /** Optional base64 data URL of a real screenshot taken by the
   *  headless browser (populated only when the action was performed
   *  by the real /api/browser/preview route, not the simulator). */
  screenshot?: string;
  /** ms it took to perform this action in the real browser (omit for
   *  simulator-emitted actions). */
  elapsedMs?: number;
  /** true when the action was performed by real headless Chromium
   *  (Vercel-side Playwright). false / undefined = simulated. */
  real?: boolean;
}

export interface RunRecord {
  id: string;
  skillId: string;
  skillName?: string;
  agentId?: string;
  goal?: string;
  inputs: Array<{ id: string; payload: unknown }>;
  totalInputs: number;
  status: "queued" | "running" | "completed" | "failed" | "review" | "cancelled";
  progress: number;
  startedAt: string;
  finishedAt?: string;
  durationSec?: number;
  message?: string;
  gcp?: "connected" | "disabled";
  /** Live browser-console log: the stream of actions the agent is
   *  "performing" in the headless browser. Populated by the
   *  client-side run simulator so the user can see the agent
   *  navigate, click, type, and extract in real time. */
  actions?: BrowserAction[];
  /** The URL the agent is currently "on". Mirrors the latest navigate. */
  currentUrl?: string;
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
  source: "recorder" | "composer" | "seed" | "manual";
  // Optional richer fields populated by the Record flow (Gemini
  // reconstructs these alongside the steps) and rendered on the
  // skill detail page.
  intent?: string;
  triggers?: string[];
  integrations?: string[];
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

/* ------------------------------------------------------------------ */
/* Composer draft                                                       */
/* ------------------------------------------------------------------ */
/* The composer's in-flight state (goal text, plan, dispatched runId,
   etc.) is persisted to localStorage so a user can navigate to /runs
   or /agents to follow what's happening and still come back to the
   composer to see the same goal + plan + dispatched-run card. Without
   this, useState in compose/page.tsx is wiped on unmount and the
   user lands on a blank input box.
   ---
   As of the multi-composer refactor, the composer page is a grid of
   parallel composer slots — each slot has its own goal, plan, and
   dispatched run, and they all run independently. The grid state is
   stored under a single key (echo.${userId}.composer.slots) as an
   array of ComposerDraft entries. */

export interface ComposerDraft {
  phase: "input" | "planning" | "review" | "running" | "completed";
  goal: string;
  plan: PlanShape | null;
  agentId: string | null;
  runId: string | null;
  error: string | null;
  dispatching: boolean;
  /** server message echoed back from /api/agents/run-autonomous */
  dispatchMessage: string | null;
  /** GCP status echoed from the dispatch API */
  dispatchGcp: "connected" | "disabled" | null;
  /** ISO timestamp of when this draft was last saved */
  savedAt: string;
}

/** A single slot in the multi-composer grid. Mirrors ComposerDraft
 *  but adds a stable `id` for React keys and slot identity. */
export interface ComposerSlot extends ComposerDraft {
  id: string;
  /** Optional friendly label, e.g. "Lead enrichment" — purely
   *  cosmetic, helps users remember what each slot is doing. */
  label?: string;
}

export interface ComposerState {
  /** All slots, in the order the user arranged them. */
  slots: ComposerSlot[];
  /** Which slot WebMCP / keyboard shortcuts should target. */
  activeSlotId: string | null;
  savedAt: string;
}

export interface PlanShape {
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
}

const COMPOSER_KEY = "composer.slots";
const LEGACY_COMPOSER_KEY = "composer";
const DEFAULT_SLOT_COUNT = 4;

function freshSlot(label?: string): ComposerSlot {
  return {
    id: `slot_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    phase: "input",
    goal: "",
    plan: null,
    agentId: null,
    runId: null,
    error: null,
    dispatching: false,
    dispatchMessage: null,
    dispatchGcp: null,
    savedAt: new Date().toISOString(),
    label,
  };
}

function defaultState(): ComposerState {
  const slots = Array.from({ length: DEFAULT_SLOT_COUNT }, () => freshSlot());
  return {
    slots,
    activeSlotId: slots[0]?.id ?? null,
    savedAt: new Date().toISOString(),
  };
}

/**
 * Load the multi-composer grid state. Migrates a legacy single
 * ComposerDraft (echo.${userId}.composer) into slot 0 if it exists,
 * then deletes the legacy key so we never re-migrate. Falls back
 * to a default 4-slot grid if nothing is persisted.
 */
export function loadComposerState(userId: string): ComposerState {
  if (typeof window === "undefined") return defaultState();
  // Try the new key first
  try {
    const raw = window.localStorage.getItem(NS(userId, COMPOSER_KEY));
    if (raw) {
      const parsed = JSON.parse(raw) as ComposerState;
      if (parsed && Array.isArray(parsed.slots) && parsed.slots.length > 0) {
        // Make sure every slot has an id (handles older snapshots
        // that predate the multi-composer refactor)
        parsed.slots = parsed.slots.map((s) =>
          s.id ? s : { ...s, id: freshSlot().id }
        );
        return parsed;
      }
    }
  } catch {
    /* fall through to migration */
  }
  // Migrate legacy single-slot data into slot 0
  try {
    const legacy = window.localStorage.getItem(NS(userId, LEGACY_COMPOSER_KEY));
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<ComposerSlot>;
      const slots = Array.from({ length: DEFAULT_SLOT_COUNT }, () => freshSlot());
      slots[0] = { ...freshSlot(), ...parsed, id: slots[0].id };
      window.localStorage.removeItem(NS(userId, LEGACY_COMPOSER_KEY));
      const state: ComposerState = {
        slots,
        activeSlotId: slots[0].id,
        savedAt: new Date().toISOString(),
      };
      saveComposerState(userId, state);
      return state;
    }
  } catch {
    /* fall through */
  }
  return defaultState();
}

export function saveComposerState(userId: string, state: ComposerState) {
  if (typeof window === "undefined") return;
  try {
    const toSave: ComposerState = { ...state, savedAt: new Date().toISOString() };
    window.localStorage.setItem(NS(userId, COMPOSER_KEY), JSON.stringify(toSave));
    window.dispatchEvent(new CustomEvent(`echo:store:${COMPOSER_KEY}`, { detail: toSave }));
  } catch {
    /* ignore quota errors */
  }
}

export function addComposerSlot(
  userId: string,
  state: ComposerState,
  label?: string
): { state: ComposerState; slot: ComposerSlot } {
  const slot = freshSlot(label);
  const next: ComposerState = {
    ...state,
    slots: [...state.slots, slot],
    activeSlotId: slot.id,
  };
  saveComposerState(userId, next);
  return { state: next, slot };
}

export function removeComposerSlot(
  userId: string,
  state: ComposerState,
  slotId: string
): ComposerState {
  if (state.slots.length <= 1) return state; // never empty
  const next: ComposerState = {
    ...state,
    slots: state.slots.filter((s) => s.id !== slotId),
    activeSlotId:
      state.activeSlotId === slotId
        ? state.slots.find((s) => s.id !== slotId)?.id ?? null
        : state.activeSlotId,
  };
  saveComposerState(userId, next);
  return next;
}

export function updateComposerSlot(
  userId: string,
  state: ComposerState,
  slotId: string,
  patch: Partial<ComposerSlot>
): ComposerState {
  const next: ComposerState = {
    ...state,
    slots: state.slots.map((s) =>
      s.id === slotId ? { ...s, ...patch, savedAt: new Date().toISOString() } : s
    ),
  };
  saveComposerState(userId, next);
  return next;
}

export function setActiveSlot(state: ComposerState, slotId: string): ComposerState {
  return { ...state, activeSlotId: slotId };
}

/** Stop the simulator + browser-runner for a runId. Used when a
 *  slot is closed mid-run so the background tickers don't keep
 *  writing to a run record nobody is looking at. */
export function cancelSlotRun(userId: string, slot: ComposerSlot) {
  if (typeof window === "undefined") return;
  if (!slot.runId) return;
  // Lazy-import the run-simulator to avoid a circular dep at module
  // load. Both modules are client-only.
  void import("./run-simulator")
    .then(({ stopRunSimulator }) => stopRunSimulator(slot.runId!))
    .catch(() => undefined);
  // Mark the run as cancelled in the store so /runs reflects it.
  try {
    const raw = window.localStorage.getItem(NS(userId, RUNS_KEY));
    if (raw) {
      const all = JSON.parse(raw) as Array<{ id: string; status: string }>;
      const next = all.map((r) =>
        r.id === slot.runId && r.status !== "completed" && r.status !== "failed"
          ? { ...r, status: "cancelled" as const }
          : r
      );
      window.localStorage.setItem(NS(userId, RUNS_KEY), JSON.stringify(next));
    }
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Legacy single-composer helpers (kept for migration only)             */
/* ------------------------------------------------------------------ */
export function loadComposerDraft(userId: string): ComposerDraft | null {
  return null;
}

export function saveComposerDraft(userId: string, _draft: ComposerDraft) {
  /* no-op — use loadComposerState / saveComposerState instead */
}

export function clearComposerDraft(userId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(NS(userId, LEGACY_COMPOSER_KEY));
  } catch {
    /* ignore */
  }
}
