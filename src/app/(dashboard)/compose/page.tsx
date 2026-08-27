"use client";

/**
 * Compose page — multi-composer grid.
 *
 * The user can run up to N agents in parallel from a single page.
 * Each ComposerCard in the grid is an independent composer with its
 * own goal, plan, dispatched run, live progress, and browser
 * console. They share the same user, the same `/api/*` routes, and
 * the same localStorage namespace but they don't block each other.
 *
 * Default grid: 4 slots (2×2 on desktop, single column on mobile).
 * `+ Add composer` appends a new empty slot. The `✕` on each card
 * removes that slot (refuses to remove the last one).
 *
 * WebMCP tools target the currently-active slot (the one the user
 * last clicked into); the badge in the top-right of the page shows
 * which slot the agent is talking to.
 */

import * as React from "react";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";
import {
  addComposerSlot,
  cancelSlotRun,
  getUserId,
  loadComposerState,
  removeComposerSlot,
  saveComposerState,
  setActiveSlot,
  updateComposerSlot,
  type ComposerState,
} from "@/lib/client/stores";
import { ComposerCard } from "@/components/ComposerCard";
import { buildComposerTools } from "@/lib/webmcp/composer-tools";
import { useWebMCPTools } from "@/lib/webmcp/use-webmcp";

const exampleGoal =
  "Get this week's new HubSpot leads, enrich each with LinkedIn, draft a personalized outreach email, and save the drafts in my Gmail drafts folder.";

export default function ComposePage() {
  const userId = React.useMemo(getUserId, []);
  const [state, setState] = React.useState<ComposerState | null>(null);
  const [hydrated, setHydrated] = React.useState(false);

  // Hydrate from localStorage. SSR + the very first client render
  // must agree, so we hydrate in an effect and re-render.
  React.useEffect(() => {
    const persisted = loadComposerState(userId);
    setState(persisted);
    setHydrated(true);
  }, [userId]);

  // Persist on every state change after hydration. saveComposerState
  // is also called inside the per-slot helpers, but we call it again
  // here as a safety net so even a non-helper patch (e.g. active
  // slot change) is durable.
  React.useEffect(() => {
    if (!hydrated || !state) return;
    saveComposerState(userId, state);
  }, [hydrated, userId, state]);

  const handleUpdate = React.useCallback(
    (slotId: string, patch: Parameters<typeof updateComposerSlot>[3]) => {
      setState((prev) => (prev ? updateComposerSlot(userId, prev, slotId, patch) : prev));
    },
    [userId]
  );

  const handleActivate = React.useCallback((slotId: string) => {
    setState((prev) => (prev ? setActiveSlot(prev, slotId) : prev));
  }, []);

  const handleClose = React.useCallback(
    (slotId: string) => {
      setState((prev) => {
        if (!prev) return prev;
        const slot = prev.slots.find((s) => s.id === slotId);
        if (!slot) return prev;
        // Stop any background tickers for this slot's run before
        // yanking the slot out of the grid.
        if (slot.runId) cancelSlotRun(userId, slot);
        return removeComposerSlot(userId, prev, slotId);
      });
    },
    [userId]
  );

  const handleAdd = React.useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      const { state: next } = addComposerSlot(userId, prev);
      return next;
    });
  }, [userId]);

  const handleFillAll = React.useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      const goals = [
        "Enrich this week's HubSpot leads with LinkedIn profiles and save the enrichment data.",
        "Draft a personalized outreach email for each enriched lead and save to Gmail drafts.",
        "Post a daily summary of new leads and drafts to the #sales channel in Slack.",
        "Append the agent's output to the Echo product roadmap page in Notion.",
        "Sync today's Stripe subscription events into a Google Sheet for finance review.",
        "Search Hacker News for top AI agent posts this week and bookmark the top 5.",
        "Look up each lead's GitHub profile and add their top repos to the CRM record.",
      ];
      const next = { ...prev };
      next.slots = prev.slots.map((s, i) =>
        s.phase === "input" && !s.goal
          ? { ...s, goal: goals[i % goals.length] }
          : s
      );
      saveComposerState(userId, next);
      return next;
    });
  }, [userId]);

  // WebMCP: register tools for the *active* slot so the in-browser
  // agent can talk to whichever composer the user is currently
  // focused on. The active slot is whichever card was most recently
  // clicked (defaults to slot 0).
  const activeSlot = state?.slots.find((s) => s.id === state.activeSlotId) ?? state?.slots[0];
  const composerTools = React.useMemo(
    () =>
      buildComposerTools({
        goal: activeSlot?.goal ?? "",
        setGoal: (g: string) => {
          if (!activeSlot) return;
          handleUpdate(activeSlot.id, { goal: g });
        },
        phase: activeSlot?.phase ?? "input",
        runId: activeSlot?.runId ?? null,
        startPlanning: async () => {
          // (the real implementation is in the card; this is just a
          // WebMCP-facing shim that emits the same effect by clicking
          // the active card's Compose button. The card owns the
          // network call so we re-implement minimally here.)
          if (!activeSlot) return;
          const goalText = activeSlot.goal.trim() || exampleGoal;
          handleUpdate(activeSlot.id, { goal: goalText, phase: "planning", error: null });
          try {
            const res = await fetch("/api/agents/compose", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ goal: goalText }),
            });
            if (!res.ok) throw new Error(`Compose failed: ${res.status}`);
            const data = await res.json();
            handleUpdate(activeSlot.id, {
              plan: {
                subtasks: data.subtasks ?? [],
                totalEstTime: data.totalEstTime ?? "10m",
                totalEstCost: data.totalEstCost ?? "$0.18",
                reasoning: data.reasoning ?? "",
              },
              phase: "review",
            });
          } catch (err) {
            handleUpdate(activeSlot.id, {
              error: err instanceof Error ? err.message : "Compose failed",
              phase: "input",
            });
          }
        },
        dispatch: async () => {
          // WebMCP dispatch — minimal version that mirrors the card's
          // dispatch behavior at the top level. The card itself has
          // the full flow; this is enough for the in-browser agent.
          if (!activeSlot?.plan) return;
          handleUpdate(activeSlot.id, { phase: "running", dispatching: true, error: null });
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeSlot?.id, activeSlot?.goal, activeSlot?.phase, activeSlot?.runId, handleUpdate]
  );
  useWebMCPTools(composerTools);

  if (!state || !hydrated) {
    // Render a placeholder skeleton so SSR and the first client
    // paint agree. After hydration we replace with the real grid.
    return (
      <div className="page-container py-10">
        <div className="mb-8">
          <p className="text-caption text-obsidian/50 mb-2">Skill Composer</p>
          <h1 className="text-display-md font-bold">Parallel agents. One screen.</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-72 rounded-2xl border border-iron bg-bone/30 animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const activeIndex = state.slots.findIndex((s) => s.id === state.activeSlotId);

  return (
    <div className="page-container py-10">
      <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-caption text-obsidian/50 mb-2">Skill Composer</p>
          <h1 className="text-display-md font-bold">Parallel agents. One screen.</h1>
          <p className="mt-3 text-body text-obsidian/70 max-w-2xl">
            Compose up to 4 agents at once. Each composer dispatches its
            own headless browser, runs in parallel, and streams its own
            live progress. Use the crosshatch to close a composer, or
            the + below to add a new one.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FeatureTag variant="iron">
            {state.slots.length} composer{state.slots.length === 1 ? "" : "s"}
          </FeatureTag>
          {activeIndex >= 0 && (
            <FeatureTag variant="dusty-sky">
              Active: Composer {activeIndex + 1}
            </FeatureTag>
          )}
          <Button variant="outline-light" size="sm" onClick={handleAdd}>
            + Add
          </Button>
          <Button variant="outline-light" size="sm" onClick={handleFillAll}>
            ✦ Sample all
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {state.slots.map((slot, i) => (
          <ComposerCard
            key={slot.id}
            slot={slot}
            index={i}
            isActive={slot.id === state.activeSlotId}
            canClose={state.slots.length > 1}
            onUpdate={(patch) => handleUpdate(slot.id, patch)}
            onActivate={() => handleActivate(slot.id)}
            onClose={() => handleClose(slot.id)}
            onRequestRun={(_id, _runId) => {
              /* no-op — the card already calls onUpdate({runId, phase: "completed"}) */
            }}
          />
        ))}
      </div>

      {/* Add composer button */}
      <div className="mt-4 flex items-center gap-3">
        <Button variant="outline-light" size="md" onClick={handleAdd}>
          + Add composer
        </Button>
        {state.slots.length === 1 && (
          <span className="text-caption text-obsidian/60">
            You closed the others — click + Add to bring more back.
          </span>
        )}
        {state.slots.length > 1 && state.slots.length < 4 && (
          <span className="text-caption text-obsidian/50">
            Default grid is 4. Add as many as you need.
          </span>
        )}
      </div>

      {/* Example cards (visible when all slots are still in input) */}
      {state.slots.every((s) => s.phase === "input" && !s.goal) && (
        <div className="mt-10">
          <h2 className="text-heading-sm font-bold mb-3">Try one of these</h2>
          <p className="text-body-sm text-obsidian/60 mb-4">
            Click a card to load the goal into the active composer.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              {
                title: "Daily lead enrichment",
                goal:
                  "Get this week's new HubSpot leads, enrich each with LinkedIn, draft a personalized outreach email, and save the drafts in my Gmail drafts folder.",
                tag: "HubSpot + LinkedIn + Gmail",
              },
              {
                title: "Weekly content repurposing",
                goal:
                  "Take the latest blog post on echo.dev and turn it into 5 tweets, 1 LinkedIn post, and 1 newsletter blurb — save the drafts to Notion for review.",
                tag: "Notion + Twitter + LinkedIn",
              },
              {
                title: "Customer health monitor",
                goal:
                  "Pull this week's Stripe usage for every paying customer and post a churn-risk alert to #customer-health on Slack for any account with a usage drop of 30% or more.",
                tag: "Stripe + Slack",
              },
            ].map((ex) => (
              <button
                key={ex.title}
                onClick={() => {
                  // Load into the active slot
                  if (state.activeSlotId) {
                    handleUpdate(state.activeSlotId, { goal: ex.goal });
                  }
                }}
                className="text-left"
              >
                <FeatureCard surface="dusty-sky" padding="md" className="hover:shadow-md transition-shadow">
                  <p className="text-caption font-medium uppercase opacity-60 mb-1">
                    Example
                  </p>
                  <p className="text-body-sm font-bold mb-2">{ex.title}</p>
                  <p className="text-caption opacity-70">{ex.tag}</p>
                </FeatureCard>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
