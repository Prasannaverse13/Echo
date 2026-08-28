"use client";

/**
 * PlanReviewPanel — the "Builder → human approval" gate.
 *
 * Shows the Builder's plan: a generalization note, the fixed-value pills
 * (each editable), the ordered steps with their kind + tool, and the
 * allowed-tools list. The user can:
 *
 *   - Edit any plan field inline.
 *   - Edit a value pill (click the pill to change the literal; the
 *     surrounding step text re-renders via `renderValues`).
 *   - Add / remove / reorder steps.
 *   - Change a step's kind (calculation / action / browser) and tool
 *     (dropdown of catalogue entries).
 *   - Add / remove values.
 *   - Edit the allowed-tools list.
 *   - Give natural-language feedback and re-build (the Builder re-runs
 *     with the previous plan in context; value / step ids are preserved
 *     where stable).
 *   - Approve → returns the plan to the parent so it can be saved as
 *     a `BuiltSkill` (and a `SkillRecord` for the library).
 *
 * Mirrors the Microsoft Skill Recorder's Builder review UI
 * (`electron/skillbuilder/builder.ts`).
 */

import * as React from "react";
import { Button, FeatureCard, FeatureTag } from "@/components/ui";
import {
  parseSkillPlan,
  slugifySkillName,
  slugifyValueId,
  type BuiltSkill,
  type PlanStep,
  type PlanStepKind,
  type SkillPlan,
  type SkillValue,
} from "@/lib/recorder/builder-schema";
import { TOOL_CATALOGUE } from "@/lib/recorder/tool-catalogue";
import { allTokenReferences, unresolvedTokens } from "@/lib/recorder/tokens";
import { InlineTokenizedText } from "./ValuePill";

export interface PlanReviewPanelProps {
  plan: SkillPlan;
  onChange: (next: SkillPlan) => void;
  onApprove: (built: BuiltSkill) => void;
  onRevise: (feedback: string) => Promise<void>;
  revising: boolean;
}

const KIND_VARIANT: Record<PlanStepKind, "dusty-sky" | "desert-clay" | "wisteria"> = {
  calculation: "dusty-sky",
  action: "desert-clay",
  browser: "wisteria",
};

const KIND_LABEL: Record<PlanStepKind, string> = {
  calculation: "calc",
  action: "action",
  browser: "browser",
};

export function PlanReviewPanel({ plan, onChange, onApprove, onRevise, revising }: PlanReviewPanelProps) {
  const [feedback, setFeedback] = React.useState("");

  const updateStep = (idx: number, patch: Partial<PlanStep>) => {
    onChange({
      ...plan,
      steps: plan.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    });
  };
  const removeStep = (idx: number) => {
    onChange({ ...plan, steps: plan.steps.filter((_, i) => i !== idx) });
  };
  const addStep = () => {
    onChange({
      ...plan,
      steps: [
        ...plan.steps,
        { kind: "action", title: "New step", text: "", tool: "" },
      ],
    });
  };
  const moveStep = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= plan.steps.length) return;
    const next = [...plan.steps];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange({ ...plan, steps: next });
  };

  const updateValue = (id: string, value: string) => {
    onChange({
      ...plan,
      values: plan.values.map((v) => (v.id === id ? { ...v, value } : v)),
    });
  };
  const updateValueName = (id: string, name: string) => {
    onChange({
      ...plan,
      values: plan.values.map((v) => (v.id === id ? { ...v, name } : v)),
    });
  };
  const addValue = () => {
    const i = plan.values.length + 1;
    const id = slugifyValueId(`value_${i}`);
    onChange({
      ...plan,
      values: [...plan.values, { id, name: `Value ${i}`, value: "" }],
    });
  };
  const removeValue = (id: string) => {
    onChange({ ...plan, values: plan.values.filter((v) => v.id !== id) });
  };

  const updateAllowedTools = (toolsRaw: string) => {
    const tools = toolsRaw
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    onChange({ ...plan, allowedTools: tools });
  };

  const handleRevise = async () => {
    const text = feedback.trim();
    if (!text) return;
    await onRevise(text);
    setFeedback("");
  };

  const handleApprove = () => {
    // Render the SKILL.md body deterministically from the plan.
    const body = renderPlanBody(plan);
    const name = slugifySkillName(plan.name || plan.title);
    const built: BuiltSkill = {
      version: 1,
      sessionId: "",
      name,
      description: plan.description,
      allowedTools: plan.allowedTools,
      plan: { ...plan, name },
      body,
      createdAt: new Date().toISOString(),
    };
    onApprove(built);
  };

  // Validation: any `{{id}}` referenced in text that has no matching value?
  const allRefs = allTokenReferences({
    body: "",
    description: plan.description,
    generalization: plan.generalization,
    stepTexts: plan.steps.map((s) => s.text),
  });
  const knownIds = new Set(plan.values.map((v) => v.id.toLowerCase()));
  const unresolved = allRefs.filter((id) => !knownIds.has(id.toLowerCase()));

  return (
    <div className="space-y-4">
      <FeatureCard surface="sandstone" padding="lg">
        <div className="flex items-start gap-3">
          <div className="text-2xl">✨</div>
          <div className="flex-1">
            <p className="text-caption font-medium uppercase opacity-60 mb-1">
              Review the skill plan
            </p>
            <p className="text-body leading-relaxed">
              Echo generalized your analysis into a reusable, parameterized
              skill. Edit the fixed values, step kinds, or tools — the
              skill adapts to any inputs you point it at.
            </p>
          </div>
        </div>
      </FeatureCard>

      {/* Name + title + description */}
      <FeatureCard surface="paper-white" padding="md" className="hairline">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-caption font-medium uppercase opacity-60 block mb-1">
              Skill name (kebab)
            </label>
            <input
              type="text"
              value={plan.name}
              onChange={(e) => onChange({ ...plan, name: slugifySkillName(e.target.value) })}
              maxLength={60}
              className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm font-mono focus:outline-none focus:border-obsidian"
            />
          </div>
          <div>
            <label className="text-caption font-medium uppercase opacity-60 block mb-1">
              Title
            </label>
            <input
              type="text"
              value={plan.title}
              onChange={(e) => onChange({ ...plan, title: e.target.value })}
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm font-bold focus:outline-none focus:border-obsidian"
            />
          </div>
        </div>
        <label className="text-caption font-medium uppercase opacity-60 block mb-1 mt-3">
          Description (trigger-oriented)
        </label>
        <textarea
          value={plan.description}
          onChange={(e) => onChange({ ...plan, description: e.target.value })}
          rows={2}
          maxLength={500}
          className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm resize-none focus:outline-none focus:border-obsidian"
        />
        <label className="text-caption font-medium uppercase opacity-60 block mb-1 mt-3">
          Generalization
        </label>
        <textarea
          value={plan.generalization}
          onChange={(e) => onChange({ ...plan, generalization: e.target.value })}
          rows={2}
          maxLength={1000}
          placeholder="How does this generalize from the one run? (e.g. iterates over all N rows, not the 3 in the recording.)"
          className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm resize-none focus:outline-none focus:border-obsidian"
        />
      </FeatureCard>

      {/* Fixed values (the {{id}} tokens) */}
      <FeatureCard surface="paper-white" padding="md" className="hairline">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-caption font-medium uppercase opacity-60">
            Fixed values ({plan.values.length})
          </h3>
          <Button variant="outline-light" size="sm" onClick={addValue}>
            + Add value
          </Button>
        </div>
        <p className="text-caption text-obsidian/50 mb-3">
          Each value is referenced as a <code className="font-mono">{"{{id}}"}</code> token
          in the steps below. Click a pill to edit the literal.
        </p>
        {plan.values.length === 0 ? (
          <p className="text-body-sm text-obsidian/40 italic">No fixed values — every step is fully generic.</p>
        ) : (
          <div className="space-y-2">
            {plan.values.map((v) => (
              <div key={v.id} className="flex items-center gap-2">
                <code className="text-caption font-mono text-obsidian/60 bg-iron/30 rounded px-1.5 py-0.5 min-w-[8ch]">
                  {`{{${v.id}}}`}
                </code>
                <input
                  type="text"
                  value={v.name}
                  onChange={(e) => updateValueName(v.id, e.target.value)}
                  placeholder="Display name"
                  className="flex-shrink-0 w-40 px-2 py-1 rounded border border-iron bg-paper-white text-caption focus:outline-none focus:border-obsidian"
                />
                <input
                  type="text"
                  value={v.value}
                  onChange={(e) => updateValue(v.id, e.target.value)}
                  placeholder="Literal value (URL / path / constant)"
                  className="flex-1 px-2 py-1 rounded border border-iron bg-paper-white text-caption font-mono focus:outline-none focus:border-obsidian"
                />
                <button
                  type="button"
                  onClick={() => removeValue(v.id)}
                  aria-label="Remove value"
                  className="text-obsidian/40 hover:text-red-500 text-caption"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </FeatureCard>

      {/* Steps */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-heading-sm font-bold">Steps ({plan.steps.length})</h2>
          <Button variant="outline-light" size="sm" onClick={addStep}>
            + Add step
          </Button>
        </div>
        {unresolved.length > 0 && (
          <div className="mb-3 p-2 rounded bg-red-50 text-caption text-red-700">
            ⚠ The step text references {unresolved.length} token{unresolved.length === 1 ? "" : "s"}
            {" "}that {unresolved.length === 1 ? "has" : "have"} no matching value: {unresolved.map((id) => `\`{{${id}}}\``).join(", ")}
          </div>
        )}
        <div className="space-y-3">
          {plan.steps.map((s, i) => (
            <FeatureCard key={i} surface="paper-white" padding="md" className="hairline">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 flex flex-col items-center gap-1">
                  <div className="w-9 h-9 rounded-full bg-obsidian text-paper-white flex items-center justify-center font-bold text-caption">
                    {i + 1}
                  </div>
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() => moveStep(i, -1)}
                      className="text-obsidian/40 hover:text-obsidian disabled:opacity-30 text-caption"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={i === plan.steps.length - 1}
                      onClick={() => moveStep(i, 1)}
                      className="text-obsidian/40 hover:text-obsidian disabled:opacity-30 text-caption"
                    >
                      ▼
                    </button>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      type="text"
                      value={s.title}
                      onChange={(e) => updateStep(i, { title: e.target.value })}
                      placeholder="Step title"
                      className="flex-1 min-w-[12ch] px-3 py-2 rounded-lg border border-iron bg-paper-white text-body font-bold focus:outline-none focus:border-obsidian"
                    />
                    <select
                      value={s.kind}
                      onChange={(e) => updateStep(i, { kind: e.target.value as PlanStepKind })}
                      className="px-2 py-1 rounded border border-iron bg-paper-white text-caption focus:outline-none focus:border-obsidian"
                    >
                      <option value="action">action</option>
                      <option value="calculation">calculation</option>
                      <option value="browser">browser</option>
                    </select>
                    <FeatureTag variant={KIND_VARIANT[s.kind]}>{KIND_LABEL[s.kind]}</FeatureTag>
                  </div>
                  <div>
                    <label className="text-caption text-obsidian/50">Tool</label>
                    <select
                      value={s.tool}
                      onChange={(e) => updateStep(i, { tool: e.target.value })}
                      className="ml-2 px-2 py-1 rounded border border-iron bg-paper-white text-caption font-mono focus:outline-none focus:border-obsidian"
                    >
                      <option value="">(no tool)</option>
                      {TOOL_CATALOGUE.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.id} — {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    value={s.text}
                    onChange={(e) => updateStep(i, { text: e.target.value })}
                    placeholder="Imperative, generalized step description. May reference {{value_id}} tokens."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm resize-none focus:outline-none focus:border-obsidian font-mono text-caption"
                  />
                  {/* Live preview of the rendered text with tokens resolved. */}
                  {s.text.includes("{{") && (
                    <div className="px-3 py-2 rounded bg-bone/50 border border-iron">
                      <p className="text-caption text-obsidian/50 mb-1">Rendered preview:</p>
                      <p className="text-body-sm leading-relaxed">
                        <InlineTokenizedText
                          text={s.text}
                          values={plan.values}
                          onChange={(id, v) => updateValue(id, v)}
                        />
                      </p>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeStep(i)}
                  aria-label="Remove step"
                  className="flex-shrink-0 w-8 h-8 rounded-lg text-obsidian/40 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  ✕
                </button>
              </div>
            </FeatureCard>
          ))}
        </div>
      </div>

      {/* Allowed tools */}
      <FeatureCard surface="paper-white" padding="md" className="hairline">
        <label className="text-caption font-medium uppercase opacity-60 block mb-1">
          Allowed tools (frontmatter)
        </label>
        <p className="text-caption text-obsidian/50 mb-2">
          Comma-separated tool ids. Goes into the SKILL.md `allowed-tools` block.
        </p>
        <textarea
          value={plan.allowedTools.join(", ")}
          onChange={(e) => updateAllowedTools(e.target.value)}
          rows={2}
          placeholder="e.g. browser_run, sheets_append, slack_post"
          className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm resize-none focus:outline-none focus:border-obsidian font-mono"
        />
      </FeatureCard>

      {/* Revise + Approve */}
      <FeatureCard surface="paper-white" padding="md" className="hairline">
        <h3 className="text-caption font-medium uppercase opacity-60 mb-2">
          Refine with natural language
        </h3>
        <p className="text-body-sm text-obsidian/60 mb-3">
          Tell Echo what to change. The Builder re-runs with the previous
          plan in context — value / step ids are preserved where stable.
        </p>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder={`e.g. "use slack_post instead of browser_run for step 2" or "add a {{date_range}} value"`}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm resize-none focus:outline-none focus:border-obsidian mb-3"
        />
        <Button
          variant="outline-light"
          size="md"
          onClick={handleRevise}
          disabled={revising || !feedback.trim()}
        >
          {revising ? "Re-building…" : "↻ Re-build with feedback"}
        </Button>
      </FeatureCard>

      <FeatureCard surface="obsidian" padding="md" className="text-paper-white">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-caption font-medium uppercase opacity-60 mb-1">
              Ready to save?
            </p>
            <p className="text-body">
              Approve to lock in the plan, render the SKILL.md, and add
              the skill to your library.
            </p>
          </div>
          <Button variant="light" size="md" onClick={handleApprove}>
            ✓ Approve & save →
          </Button>
        </div>
      </FeatureCard>
    </div>
  );
}

/** Mirror of `builder-schema.ts#renderPlanBody` for the client-side preview. */
function renderPlanBody(plan: SkillPlan): string {
  const lines: string[] = [];
  lines.push("## When to use");
  lines.push("");
  lines.push(plan.description.trim());
  lines.push("");
  if (plan.generalization) {
    lines.push("## Generalization");
    lines.push("");
    lines.push(plan.generalization.trim());
    lines.push("");
  }
  if (plan.values.length > 0) {
    lines.push("## Fixed values");
    lines.push("");
    for (const v of plan.values) {
      lines.push(`- \`{{${v.id}}}\` — ${v.name}: ${v.value}`);
    }
    lines.push("");
  }
  lines.push("## Procedure");
  lines.push("");
  plan.steps.forEach((s, i) => {
    const verb = s.kind === "calculation" ? "Compute" : s.kind === "browser" ? "In the browser," : "Then";
    lines.push(`### ${i + 1}. ${s.title || `Step ${i + 1}`}`);
    lines.push("");
    if (s.tool) lines.push(`_Tool: \`${s.tool}\` · Kind: \`${s.kind}\`_`);
    else lines.push(`_Kind: \`${s.kind}\`_`);
    lines.push("");
    lines.push(`${verb} ${s.text.trim()}`);
    lines.push("");
  });
  if (plan.summary) {
    lines.push("## Summary");
    lines.push("");
    lines.push(plan.summary.trim());
    lines.push("");
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

// Keep `parseSkillPlan` import in scope so linter doesn't drop it; useful
// when this panel is fed an untrusted raw JSON in a future iteration.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _keep = parseSkillPlan;
// Keep the SkillValue type referenced for the lint pass.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _sv: SkillValue | null = null;
// Keep unresolvedTokens import in scope.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _u = unresolvedTokens;
