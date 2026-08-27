"use client";

/**
 * Agents-page WebMCP tools.
 *
 * Exposed on `/agents`. Lets an in-browser agent list saved agents,
 * inspect one in detail, fire a saved agent (re-dispatches its goal),
 * and archive (soft-delete) agents.
 */

import type { WebMCPToolDefinition } from "./types";
import {
  deleteAgent,
  getAgent,
  getUserId,
  listAgents,
  saveAgent,
  type AgentRecord,
} from "@/lib/client/stores";
import { fireToast } from "./global-tools";

const AGENT_STATUSES = ["planning", "active", "paused", "archived"] as const;
type AgentStatus = (typeof AGENT_STATUSES)[number];

function toSummary(a: AgentRecord) {
  return {
    id: a.id,
    name: a.name,
    goal: a.goal?.slice(0, 160),
    status: a.status,
    subtaskCount: a.subtasks.length,
    totalEstTime: a.totalEstTime,
    totalEstCost: a.totalEstCost,
    createdAt: a.createdAt,
    nextRun: a.nextRun,
  };
}

interface DispatchResponse {
  ok: boolean;
  runId: string;
  agentId: string | null;
  message: string;
  inputs: number;
  gcp: "connected" | "disabled";
}

export function buildAgentsTools(): WebMCPToolDefinition[] {
  const userId = getUserId();

  return [
    {
      name: "list_agents",
      title: "List agents",
      description:
        "List saved agents from local storage, optionally filtered by status. Returns the most recent N agents.",
      inputSchema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: [...AGENT_STATUSES],
            description: "Filter to agents in this status. Omit for all (archived included).",
          },
          limit: {
            type: "number",
            minimum: 1,
            maximum: 50,
            description: "Max agents to return. Default 10.",
          },
        },
      },
      annotations: { readOnlyHint: true },
      execute: ({ status, limit }) => {
        const all = listAgents(userId);
        const filtered = status ? all.filter((a) => a.status === status) : all;
        const n = Math.max(1, Math.min(50, Number(limit) || 10));
        return {
          count: filtered.length,
          returned: Math.min(n, filtered.length),
          agents: filtered.slice(0, n).map(toSummary),
        };
      },
    },
    {
      name: "get_agent",
      title: "Get agent",
      description:
        "Fetch the full details of a saved agent including subtasks, estimated time, estimated cost, and reasoning.",
      inputSchema: {
        type: "object",
        properties: { agentId: { type: "string" } },
        required: ["agentId"],
      },
      annotations: { readOnlyHint: true },
      execute: ({ agentId }) => {
        const a = getAgent(userId, String(agentId));
        if (!a) throw new Error(`agent ${agentId} not found in local storage`);
        return a;
      },
    },
    {
      name: "dispatch_saved_agent",
      title: "Dispatch saved agent",
      description:
        "Re-fire a previously-saved agent by id. Sends the agent's original goal to /api/agents/run-autonomous and returns a new runId. Useful for repeating a workflow without retyping the goal.",
      inputSchema: {
        type: "object",
        properties: {
          agentId: { type: "string", description: "Saved agent id to dispatch." },
          inputCount: {
            type: "number",
            minimum: 1,
            maximum: 20,
            description: "Inputs to process. Default 5.",
          },
          showToast: { type: "boolean", description: "Fire a success toast. Default true." },
        },
        required: ["agentId"],
      },
      annotations: { readOnlyHint: false },
      execute: async ({ agentId, inputCount, showToast }) => {
        const a = getAgent(userId, String(agentId));
        if (!a) throw new Error(`agent ${agentId} not found`);
        if (a.status === "archived") {
          throw new Error(`agent ${agentId} is archived — un-archive first`);
        }
        const n = Math.max(1, Math.min(20, Number(inputCount) || 5));
        const res = await fetch("/api/agents/run-autonomous", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goal: a.goal, inputCount: n }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `dispatch failed: HTTP ${res.status}`);
        }
        const data = (await res.json()) as DispatchResponse;
        if (showToast !== false) {
          fireToast({
            level: "success",
            message: `Dispatched: ${a.name} (${data.inputs} inputs)`,
          });
        }
        return {
          runId: data.runId,
          message: data.message,
          inputs: data.inputs,
          gcp: data.gcp,
          sourceAgentId: a.id,
        };
      },
    },
    {
      name: "archive_agent",
      title: "Archive agent",
      description:
        "Soft-delete a saved agent. Sets its status to 'archived'; the agent can still be re-dispatched (archive_agent auto-un-archives on dispatch). Use delete_agent to remove permanently.",
      inputSchema: {
        type: "object",
        properties: { agentId: { type: "string" } },
        required: ["agentId"],
      },
      annotations: { readOnlyHint: false },
      execute: ({ agentId }) => {
        const a = getAgent(userId, String(agentId));
        if (!a) throw new Error(`agent ${agentId} not found`);
        saveAgent(userId, { ...a, status: "archived" });
        return { ok: true, agentId: a.id, newStatus: "archived" };
      },
    },
    {
      name: "delete_agent",
      title: "Delete agent",
      description:
        "Permanently remove a saved agent from local storage. This cannot be undone.",
      inputSchema: {
        type: "object",
        properties: { agentId: { type: "string" } },
        required: ["agentId"],
      },
      annotations: { readOnlyHint: false },
      execute: ({ agentId }) => {
        const a = getAgent(userId, String(agentId));
        if (!a) throw new Error(`agent ${agentId} not found`);
        deleteAgent(userId, a.id);
        return { ok: true, agentId: a.id, removed: true };
      },
    },
    {
      name: "get_agents_overview",
      title: "Agents overview",
      description:
        "Aggregate stats across all saved agents: count by status, total subtasks planned, sum of estimated time and cost.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      execute: () => {
        const all = listAgents(userId);
        const byStatus = all.reduce<Record<string, number>>((acc, a) => {
          acc[a.status] = (acc[a.status] ?? 0) + 1;
          return acc;
        }, {});
        const totalSubtasks = all.reduce((sum, a) => sum + a.subtasks.length, 0);
        return {
          total: all.length,
          byStatus,
          totalSubtasks,
          lastAgentAt: all[0]?.createdAt ?? null,
        };
      },
    },
  ];
}
