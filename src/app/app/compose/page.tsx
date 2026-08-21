"use client";

import * as React from "react";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";

type Phase = "input" | "planning" | "review" | "scheduled";

interface SubTask {
  num: number;
  title: string;
  matchedSkill: string;
  parallel: boolean;
  estTime: string;
}

const exampleGoal =
  "Every Friday at 5pm, get this week's new HubSpot leads, enrich them with LinkedIn, draft a personalized outreach email for each, and put the drafts in my Gmail drafts folder.";

export default function ComposePage() {
  const [phase, setPhase] = React.useState<Phase>("input");
  const [goal, setGoal] = React.useState("");
  const [plan, setPlan] = React.useState<{
    subtasks: SubTask[];
    totalEstTime: string;
    totalEstCost: string;
    reasoning: string;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const startPlanning = async () => {
    setError(null);
    const goalText = goal.trim() || exampleGoal;
    setGoal(goalText);
    setPhase("planning");

    try {
      const res = await fetch("/api/agents/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: goalText }),
      });
      if (!res.ok) throw new Error(`Compose failed: ${res.status}`);
      const data = await res.json();
      setPlan(data);
      setPhase("review");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Echo couldn't compose a plan. Please try again."
      );
      setPhase("input");
    }
  };

  return (
    <div className="page-container py-10">
      <div className="mb-8">
        <p className="text-caption text-obsidian/50 mb-2">Skill Composer</p>
        <h1 className="text-display-md font-bold">Describe a goal. Echo composes the agent.</h1>
        <p className="mt-3 text-body text-obsidian/70 max-w-2xl">
          Tell Echo what you want done, in plain English. The Skill Manager
          breaks it into steps, finds the right skills, and spawns a
          sub-agent to run it — autonomously, in the background.
        </p>
      </div>

      {/* Input phase */}
      {phase === "input" && (
        <div className="max-w-3xl">
          <FeatureCard surface="paper-white" padding="lg" className="hairline">
            <label className="text-caption font-medium uppercase opacity-60 mb-3 block">
              What's the goal?
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={5}
              placeholder="e.g. Every Monday, summarize last week's customer feedback from Slack and email me a PDF report..."
              className="w-full px-4 py-3 rounded-2xl border border-iron bg-paper-white text-body resize-none focus:outline-none focus:border-obsidian"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => setGoal(exampleGoal)}
                className="text-caption text-obsidian/60 hover:text-obsidian underline-offset-4 hover:underline"
              >
                Try an example →
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-iron flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                <FeatureTag variant="iron">⏰ Schedule</FeatureTag>
                <FeatureTag variant="iron">⚡ Trigger</FeatureTag>
                <FeatureTag variant="iron">▶ One-shot</FeatureTag>
              </div>
              <Button variant="light" size="md" onClick={startPlanning}>
                ❖ Compose agent
              </Button>
            </div>
          </FeatureCard>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <FeatureCard surface="dusty-sky" padding="md">
              <p className="text-caption font-medium uppercase opacity-60 mb-1">
                Example
              </p>
              <p className="text-body-sm font-bold mb-2">Daily lead enrichment</p>
              <p className="text-body-sm opacity-80">
                HubSpot → LinkedIn → personalized email → Gmail drafts
              </p>
            </FeatureCard>
            <FeatureCard surface="wisteria" padding="md">
              <p className="text-caption font-medium uppercase opacity-60 mb-1">
                Example
              </p>
              <p className="text-body-sm font-bold mb-2">Weekly content repurposing</p>
              <p className="text-body-sm opacity-80">
                Blog post → platform-specific social copy → schedule
              </p>
            </FeatureCard>
            <FeatureCard surface="desert-clay" padding="md">
              <p className="text-caption font-medium uppercase opacity-60 mb-1">
                Example
              </p>
              <p className="text-body-sm font-bold mb-2">Customer health monitor</p>
              <p className="text-body-sm opacity-80">
                Stripe usage → Slack alerts when churn risk detected
              </p>
            </FeatureCard>
          </div>
        </div>
      )}

      {/* Planning phase */}
      {phase === "planning" && (
        <FeatureCard surface="obsidian" padding="lg" className="text-paper-white">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-paper-white/10 flex items-center justify-center">
              <span className="text-2xl animate-spin">⟳</span>
            </div>
            <div>
              <h2 className="text-heading-sm font-bold">Echo is composing...</h2>
              <p className="text-body-sm text-paper-white/60 mt-1">
                Breaking your goal into steps, matching skills, drafting a plan.
              </p>
            </div>
          </div>
          <div className="mt-6 space-y-2 text-caption text-paper-white/40 font-mono">
            <p>→ Parsing goal semantics with Gemini 3.5 Flash...</p>
            <p>→ Decomposing into sub-tasks...</p>
            <p>→ Searching your skill library...</p>
            <p>→ Drafting orchestrator plan...</p>
          </div>
        </FeatureCard>
      )}

      {error && (
        <div className="max-w-3xl">
          <FeatureCard surface="desert-clay" padding="md">
            <p className="text-body-sm font-medium">⚠ {error}</p>
          </FeatureCard>
        </div>
      )}

      {/* Review phase */}
      {(phase === "review" || phase === "scheduled") && plan && (
        <div className="max-w-4xl space-y-6">
          <FeatureCard surface="sandstone" padding="lg">
            <p className="text-caption font-medium uppercase opacity-60 mb-2">
              Your goal
            </p>
            <p className="text-body leading-relaxed">{goal}</p>
          </FeatureCard>

          <div>
            <h2 className="text-heading-sm font-bold mb-3">Echo's plan</h2>
            <p className="text-body text-obsidian/70 mb-6">
              {plan.reasoning}
            </p>

            <div className="space-y-3">
              {plan.subtasks.map((step) => {
                const isNew = step.matchedSkill.startsWith("NEW:");
                return (
                  <FeatureCard
                    key={step.num}
                    surface="paper-white"
                    padding="md"
                    className="hairline"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-obsidian text-paper-white flex items-center justify-center font-bold">
                        {step.num}
                      </div>
                      <div className="flex-1">
                        <h3 className="text-body font-bold">{step.title}</h3>
                        <p className="text-caption text-obsidian/60 mt-0.5">
                          {isNew ? (
                            <>
                              Needs new skill:{" "}
                              <em>{step.matchedSkill.replace("NEW: ", "")}</em>
                            </>
                          ) : (
                            <>
                              Uses skill: <em>{step.matchedSkill}</em>
                            </>
                          )}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {step.parallel && (
                          <FeatureTag variant="wisteria">⚡ Parallel</FeatureTag>
                        )}
                        {isNew && (
                          <FeatureTag variant="desert-clay">+ Record</FeatureTag>
                        )}
                        <span className="text-caption text-obsidian/50">
                          ~{step.estTime}
                        </span>
                      </div>
                    </div>
                  </FeatureCard>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FeatureCard surface="dusty-sky" padding="md">
              <p className="text-caption font-medium uppercase opacity-60 mb-1">
                Total estimated time
              </p>
              <p className="text-display-md font-bold">~{plan.totalEstTime}</p>
            </FeatureCard>
            <FeatureCard surface="mist-mint" padding="md">
              <p className="text-caption font-medium uppercase opacity-60 mb-1">
                Estimated cost
              </p>
              <p className="text-display-md font-bold">{plan.totalEstCost}</p>
            </FeatureCard>
          </div>

          <FeatureCard surface="deep-teal" padding="lg" className="text-paper-white">
            <h3 className="text-heading-sm font-bold mb-3">Schedule this agent</h3>
            <p className="text-body-sm text-paper-white/70 mb-4">
              Runs on a schedule you pick, automatically. You get a Slack ping
              when it's done.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button variant="dark" size="md" onClick={() => setPhase("scheduled")}>
                ✓ Schedule
              </Button>
              <Button variant="outline-dark" size="md">
                ▶ Run once now
              </Button>
              <Button variant="outline-dark" size="md" onClick={() => setPhase("input")}>
                ✎ Edit goal
              </Button>
            </div>
          </FeatureCard>

          {phase === "scheduled" && (
            <FeatureCard surface="mist-mint" padding="lg">
              <div className="flex items-center gap-3">
                <span className="text-3xl">✓</span>
                <div>
                  <h3 className="text-heading-sm font-bold">Agent scheduled</h3>
                  <p className="text-body-sm opacity-70 mt-1">
                    Next run: configured by you. We'll ping you on Slack when
                    it starts and when it finishes.
                  </p>
                </div>
              </div>
            </FeatureCard>
          )}
        </div>
      )}
    </div>
  );
}
