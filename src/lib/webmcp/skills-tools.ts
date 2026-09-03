"use client";

/**
 * Skills-page WebMCP tools.
 *
 * Exposed on `/skills`. Lets an in-browser agent:
 *   - list and search saved skills
 *   - read a skill's full details
 *   - pull a skill's portable SKILL.md text (the headline tool — drops
 *     a fully-parameterized markdown artifact into the agent's context)
 *   - create a new skill from a plain-text description (the
 *     non-screen-capture creation path, hits /api/skills/save)
 *   - dispatch a saved skill as an autonomous run (the headline
 *     "use this skill" tool — sends the skill's name + goal to
 *     /api/agents/run-autonomous, which matches it via the Skill Manager)
 *   - delete a skill
 *
 * These are the natural completion of the existing
 * {agents, runs, composer}-tools surface. Combined, an in-browser agent
 * can inspect the whole library, then either read the SKILL.md or fire
 * the skill — all without leaving the page.
 */

import type { WebMCPToolDefinition } from "./types";
import {
  deleteSkillFromStore,
  getUserId,
  listSkills,
  saveSkillToStore,
  type SkillRecord,
} from "@/lib/client/stores";
import { generateSkillFromRecordSmart } from "@/lib/client/skill-md";
import { fireToast } from "./global-tools";

function toSummary(s: SkillRecord) {
  return {
    id: s.id,
    name: s.name,
    description: s.description?.slice(0, 200),
    color: s.color ?? null,
    trigger: s.trigger ?? "Manual",
    integrations: s.integrations ?? [],
    source: s.source ?? null,
    createdAt: s.createdAt,
    hasAnalysis: !!s.analysis,
    hasBuilt: !!s.built,
  };
}

function findSkill(userId: string, id: string): SkillRecord | undefined {
  return listSkills(userId).find((s) => s.id === id);
}

interface CreateSkillResponse {
  ok: boolean;
  skill: SkillRecord;
  gcp: "connected" | "disabled" | "error";
}

interface DispatchResponse {
  ok: boolean;
  runId: string;
  agentId: string | null;
  message: string;
  inputs: number;
  gcp: "connected" | "disabled";
  plan?: {
    subtasks: Array<{ num: number; title: string; matchedSkill?: string; parallel?: boolean; estTime: string }>;
    totalEstTime: string;
    totalEstCost: string;
    reasoning: string;
  };
}

export function buildSkillsTools(): WebMCPToolDefinition[] {
  const userId = getUserId();

  return [
    {
      name: "list_skills",
      title: "List skills",
      description:
        "List Echo skills from local storage, most recent first. Returns id, name, description, trigger, integrations, and whether the skill has a Describer analysis and/or Builder plan attached. Use find_skills_by_name to narrow by keyword.",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            minimum: 1,
            maximum: 100,
            description: "Max skills to return. Default 20.",
          },
        },
      },
      annotations: { readOnlyHint: true },
      execute: ({ limit }) => {
        const all = listSkills(userId);
        const n = Math.max(1, Math.min(100, Number(limit) || 20));
        return {
          count: all.length,
          returned: Math.min(n, all.length),
          skills: all.slice(0, n).map(toSummary),
        };
      },
    },
    {
      name: "get_skill",
      title: "Get skill",
      description:
        "Fetch the full details of a saved skill including its Describer analysis and Builder plan (if present). Use this when the user asks about a specific skill, or before dispatching.",
      inputSchema: {
        type: "object",
        properties: {
          skillId: { type: "string", description: "The skill id." },
        },
        required: ["skillId"],
      },
      annotations: { readOnlyHint: true },
      execute: ({ skillId }) => {
        const s = findSkill(userId, String(skillId));
        if (!s) throw new Error(`skill ${skillId} not found in local storage`);
        return s;
      },
    },
    {
      name: "find_skills_by_name",
      title: "Find skills by name",
      description:
        "Search Echo skills whose name or description contains the given substring (case-insensitive). Returns the most recent N matches. Useful when the user names a workflow (\"the LinkedIn search one\") and you need to find the right id before dispatching it.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Substring to search in name or description.",
          },
          limit: {
            type: "number",
            minimum: 1,
            maximum: 50,
            description: "Max matches. Default 5.",
          },
        },
        required: ["query"],
      },
      annotations: { readOnlyHint: true },
      execute: ({ query, limit }) => {
        const q = String(query).toLowerCase();
        const all = listSkills(userId);
        const matches = all.filter(
          (s) =>
            s.name?.toLowerCase().includes(q) ||
            s.description?.toLowerCase().includes(q)
        );
        const n = Math.max(1, Math.min(50, Number(limit) || 5));
        return {
          count: matches.length,
          skills: matches.slice(0, n).map(toSummary),
        };
      },
    },
    {
      name: "get_skill_md",
      title: "Get SKILL.md",
      description:
        "Generate and return the portable SKILL.md text for a saved skill. This is the headline tool: the markdown is fully parameterized with {{token}} placeholders, has YAML frontmatter, rules, and error codes. The agent can then execute the workflow itself, paste the markdown into another runtime, or pass it to the user. Newer skills (with version=1 built plan) get the rich Builder format; older recordings get the recorded-skill format.",
      inputSchema: {
        type: "object",
        properties: {
          skillId: {
            type: "string",
            description: "The skill id to render.",
          },
        },
        required: ["skillId"],
      },
      annotations: { readOnlyHint: true },
      execute: ({ skillId }) => {
        const s = findSkill(userId, String(skillId));
        if (!s) throw new Error(`skill ${skillId} not found`);
        const md = generateSkillFromRecordSmart(s);
        return {
          skillId: s.id,
          name: s.name,
          markdown: md,
          bytes: md.length,
          format: s.built?.version === 1 ? "builder-v1" : "recorded",
        };
      },
    },
    {
      name: "create_skill_from_text",
      title: "Create skill from text",
      description:
        "Create a new Echo skill by describing it in plain text. The skill is persisted to local storage and (best-effort) to Firestore. No screen recording is required — the Skill Manager will treat this as a hand-authored skill. Returns the saved record with its assigned id.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Skill name (required)." },
          description: {
            type: "string",
            description: "Plain-English description of the workflow (required).",
          },
          trigger: {
            type: "string",
            description: "When this skill runs — e.g. 'Manual', 'Webhook', 'Schedule · Mon 9am'. Optional.",
          },
          integrations: {
            type: "array",
            items: { type: "string" },
            description: "List of tools/services the skill touches — e.g. ['Gmail','Sheets']. Optional.",
          },
        },
        required: ["name", "description"],
      },
      annotations: { readOnlyHint: false },
      execute: async ({ name, description, trigger, integrations }) => {
        const res = await fetch("/api/skills/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: String(name).trim(),
            description: String(description).trim(),
            trigger: typeof trigger === "string" ? trigger : "Manual",
            integrations: Array.isArray(integrations) ? integrations : [],
            steps: [],
            intent: String(description).trim(),
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `save failed: HTTP ${res.status}`);
        }
        const data = (await res.json()) as CreateSkillResponse;
        if (data?.skill) {
          saveSkillToStore(userId, data.skill);
        }
        fireToast({
          level: "success",
          message: `Saved skill: ${data.skill.name}`,
        });
        return {
          ok: true,
          skill: data.skill,
          gcp: data.gcp,
        };
      },
    },
    {
      name: "dispatch_saved_skill",
      title: "Dispatch saved skill",
      description:
        "Fire a saved skill as an autonomous run. Sends the skill's name + a short goal to /api/agents/run-autonomous, which matches the saved skill via the Skill Manager and dispatches a real headless-browser agent. The headline \"use this skill to do X\" tool. Returns the runId, agentId, and a server message.",
      inputSchema: {
        type: "object",
        properties: {
          skillId: {
            type: "string",
            description: "The skill id to dispatch.",
          },
          goal: {
            type: "string",
            description:
              "Plain-English goal for the run (e.g. 'Process the new RFPs in /RFPs'). Optional — defaults to the skill's recorded intent.",
          },
          inputCount: {
            type: "number",
            minimum: 1,
            maximum: 20,
            description: "Inputs to process. Default 5.",
          },
          showToast: {
            type: "boolean",
            description: "Fire a success toast. Default true.",
          },
        },
        required: ["skillId"],
      },
      annotations: { readOnlyHint: false },
      execute: async ({ skillId, goal, inputCount, showToast }) => {
        const s = findSkill(userId, String(skillId));
        if (!s) throw new Error(`skill ${skillId} not found`);
        const g =
          typeof goal === "string" && goal.trim().length > 0
            ? goal.trim()
            : s.intent || s.description || s.name;
        const n = Math.max(1, Math.min(20, Number(inputCount) || 5));
        const res = await fetch("/api/agents/run-autonomous", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goal: g, inputCount: n }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `dispatch failed: HTTP ${res.status}`);
        }
        const data = (await res.json()) as DispatchResponse;
        if (showToast !== false) {
          fireToast({
            level: "success",
            message: `Dispatched: ${s.name} (${data.inputs} inputs)`,
          });
        }
        return {
          runId: data.runId,
          agentId: data.agentId,
          message: data.message,
          inputs: data.inputs,
          gcp: data.gcp,
          sourceSkillId: s.id,
          sourceSkillName: s.name,
        };
      },
    },
    {
      name: "delete_skill",
      title: "Delete skill",
      description:
        "Permanently remove a saved skill from local storage. This cannot be undone — the SKILL.md file is not affected (it lives on disk if you exported it).",
      inputSchema: {
        type: "object",
        properties: {
          skillId: { type: "string", description: "The skill id to remove." },
        },
        required: ["skillId"],
      },
      annotations: { readOnlyHint: false },
      execute: ({ skillId }) => {
        const s = findSkill(userId, String(skillId));
        if (!s) throw new Error(`skill ${skillId} not found`);
        deleteSkillFromStore(userId, s.id);
        return { ok: true, skillId: s.id, removed: true };
      },
    },
  ];
}
