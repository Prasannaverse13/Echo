"use client";

/**
 * AnalysisReviewPanel — the "Describer → human approval" gate.
 *
 * Shows the Describer's reconstructed analysis (title, intent, intent
 * confidence + rationale, ordered steps with per-step confidence). The
 * user can:
 *
 *   - Edit any field inline.
 *   - Delete a step (the LLM included something that doesn't belong).
 *   - Add a step manually.
 *   - Reorder steps (up/down arrows).
 *   - Give an overall natural-language feedback and re-run the Describer
 *     (the new analysis is merged with the old, preserving step ids).
 *   - Give per-step feedback before re-running.
 *   - Approve to move on to the Builder stage.
 *
 * This is the human-in-the-loop gate from the Microsoft Skill Recorder
 * pipeline (see `common/analysis.ts` in that repo).
 */

import * as React from "react";
import { Button, FeatureCard, FeatureTag } from "@/components/ui";
import type {
  Analysis,
  AnalysisStep,
  Confidence,
  FeedbackEntry,
} from "@/lib/recorder/analysis-schema";

export interface AnalysisReviewPanelProps {
  /** The current analysis (editable). */
  analysis: Analysis;
  /** Called when the user edits the analysis inline. */
  onChange: (next: Analysis) => void;
  /** Called when the user clicks "Approve → build skill". */
  onApprove: () => void;
  /** Called when the user wants to re-run the Describer with feedback. */
  onReAnalyze: (feedback: { overall?: string; steps: Array<{ stepId: string; note: string }> }) => Promise<void>;
  /** True while the re-analyze call is in flight. */
  reAnalyzing: boolean;
  /** Source label from the API ("aistudio" / "vertex" / "mock"). */
  source?: string | null;
}

const CONFIDENCE_VARIANT: Record<Confidence, "mist-mint" | "desert-clay" | "iron"> = {
  high: "mist-mint",
  medium: "desert-clay",
  low: "iron",
};

export function AnalysisReviewPanel({
  analysis,
  onChange,
  onApprove,
  onReAnalyze,
  reAnalyzing,
  source,
}: AnalysisReviewPanelProps) {
  const [overallFeedback, setOverallFeedback] = React.useState("");
  const [stepFeedback, setStepFeedback] = React.useState<Record<string, string>>({});
  const [expandedFeedback, setExpandedFeedback] = React.useState<string | null>(null);

  const updateStep = (idx: number, patch: Partial<AnalysisStep>) => {
    const next: Analysis = {
      ...analysis,
      steps: analysis.steps.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    };
    onChange(next);
  };

  const removeStep = (idx: number) => {
    const next: Analysis = {
      ...analysis,
      steps: analysis.steps
        .filter((_, i) => i !== idx)
        .map((s, i) => ({ ...s, id: s.id || `s${i + 1}` })),
    };
    onChange(next);
  };

  const addStep = () => {
    const newStep: AnalysisStep = {
      id: `s${analysis.steps.length + 1}`,
      title: "New step",
      detail: "",
      apps: [],
      evidence: [],
      confidence: "medium",
    };
    onChange({ ...analysis, steps: [...analysis.steps, newStep] });
  };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= analysis.steps.length) return;
    const next = [...analysis.steps];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange({ ...analysis, steps: next });
  };

  const handleReAnalyze = async () => {
    const overall = overallFeedback.trim() || undefined;
    const steps = Object.entries(stepFeedback)
      .filter(([, note]) => note.trim())
      .map(([stepId, note]) => ({ stepId, note: note.trim() }));
    if (!overall && steps.length === 0) return;
    await onReAnalyze({ overall, steps });
    setOverallFeedback("");
    setStepFeedback({});
    setExpandedFeedback(null);
  };

  return (
    <div className="space-y-4">
      <FeatureCard surface="sandstone" padding="lg">
        <div className="flex items-start gap-3">
          <div className="text-2xl">🧠</div>
          <div className="flex-1">
            <p className="text-caption font-medium uppercase opacity-60 mb-1">
              Review the analysis
            </p>
            <p className="text-body leading-relaxed">
              Echo reconstructed <strong>{analysis.steps.length} step{analysis.steps.length === 1 ? "" : "s"}</strong> from your recording. Correct anything that doesn't match what you actually did, then approve to build the skill.
            </p>
            {source && (
              <p className="mt-2 text-caption text-obsidian/50">
                Reconstructed by Gemini ({source}).
                {analysis.revision > 1 && ` Revision ${analysis.revision} (re-analyzed ${analysis.revision - 1}×).`}
              </p>
            )}
          </div>
        </div>
      </FeatureCard>

      {/* Title */}
      <FeatureCard surface="paper-white" padding="md" className="hairline">
        <label className="text-caption font-medium uppercase opacity-60 block mb-2">
          Skill title
        </label>
        <input
          type="text"
          value={analysis.title}
          onChange={(e) => onChange({ ...analysis, title: e.target.value })}
          maxLength={80}
          className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body font-bold focus:outline-none focus:border-obsidian"
        />
      </FeatureCard>

      {/* Intent + confidence + rationale */}
      <FeatureCard surface="paper-white" padding="md" className="hairline">
        <div className="flex items-center justify-between mb-2">
          <label className="text-caption font-medium uppercase opacity-60">
            Intent
          </label>
          <select
            value={analysis.intentConfidence}
            onChange={(e) =>
              onChange({ ...analysis, intentConfidence: e.target.value as Confidence })
            }
            className="text-caption px-2 py-1 rounded border border-iron bg-paper-white focus:outline-none focus:border-obsidian"
          >
            <option value="high">High confidence</option>
            <option value="medium">Medium confidence</option>
            <option value="low">Low confidence</option>
          </select>
        </div>
        <textarea
          value={analysis.intent}
          onChange={(e) => onChange({ ...analysis, intent: e.target.value })}
          rows={2}
          maxLength={500}
          placeholder="One sentence: what is the user trying to accomplish?"
          className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body resize-none focus:outline-none focus:border-obsidian mb-3"
        />
        <label className="text-caption font-medium uppercase opacity-60 block mb-2">
          Rationale
        </label>
        <textarea
          value={analysis.intentRationale}
          onChange={(e) => onChange({ ...analysis, intentRationale: e.target.value })}
          rows={2}
          maxLength={1500}
          placeholder="1-2 sentences of evidence for the intent, past tense."
          className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm resize-none focus:outline-none focus:border-obsidian"
        />
      </FeatureCard>

      {/* Steps */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-heading-sm font-bold">
            Steps ({analysis.steps.length})
          </h2>
          <Button variant="outline-light" size="sm" onClick={addStep}>
            + Add step
          </Button>
        </div>
        <div className="space-y-3">
          {analysis.steps.map((s, i) => (
            <FeatureCard
              key={s.id || i}
              surface="paper-white"
              padding="md"
              className="hairline"
            >
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
                      disabled={i === analysis.steps.length - 1}
                      onClick={() => moveStep(i, 1)}
                      className="text-obsidian/40 hover:text-obsidian disabled:opacity-30 text-caption"
                    >
                      ▼
                    </button>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={s.title}
                      onChange={(e) => updateStep(i, { title: e.target.value })}
                      placeholder="Step title (past tense)"
                      className="flex-1 px-3 py-2 rounded-lg border border-iron bg-paper-white text-body font-bold focus:outline-none focus:border-obsidian"
                    />
                    <FeatureTag variant={CONFIDENCE_VARIANT[s.confidence]}>
                      {s.confidence}
                    </FeatureTag>
                  </div>
                  <textarea
                    value={s.detail}
                    onChange={(e) => updateStep(i, { detail: e.target.value })}
                    placeholder="What happened, verb-first, past tense."
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm resize-none focus:outline-none focus:border-obsidian"
                  />
                  {s.apps.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {s.apps.map((a, j) => (
                        <FeatureTag key={j} variant="iron">{a}</FeatureTag>
                      ))}
                    </div>
                  )}
                  {/* Per-step feedback (collapsed by default) */}
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedFeedback(expandedFeedback === s.id ? null : s.id)
                    }
                    className="text-caption text-obsidian/50 hover:text-obsidian"
                  >
                    {expandedFeedback === s.id ? "▾" : "▸"} Add feedback for this step
                  </button>
                  {expandedFeedback === s.id && (
                    <textarea
                      value={stepFeedback[s.id] ?? ""}
                      onChange={(e) =>
                        setStepFeedback({ ...stepFeedback, [s.id]: e.target.value })
                      }
                      placeholder={`e.g. "this step is irrelevant" or "you missed the click on Save"`}
                      rows={2}
                      className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm resize-none focus:outline-none focus:border-obsidian"
                    />
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

      {/* Re-analyze with feedback */}
      <FeatureCard surface="paper-white" padding="md" className="hairline">
        <h3 className="text-caption font-medium uppercase opacity-60 mb-2">
          Re-analyze with feedback
        </h3>
        <p className="text-body-sm text-obsidian/60 mb-3">
          If the intent or steps are off, tell Echo what to fix and we'll
          re-run the Describer with your feedback in context.
        </p>
        <textarea
          value={overallFeedback}
          onChange={(e) => setOverallFeedback(e.target.value)}
          placeholder={`e.g. "the intent is wrong — it's about X, not Y" or "you missed a step where I copied text"`}
          rows={2}
          className="w-full px-3 py-2 rounded-lg border border-iron bg-paper-white text-body-sm resize-none focus:outline-none focus:border-obsidian mb-3"
        />
        <Button
          variant="outline-light"
          size="md"
          onClick={handleReAnalyze}
          disabled={reAnalyzing || (!overallFeedback.trim() && Object.values(stepFeedback).every((v) => !v.trim()))}
        >
          {reAnalyzing ? "Re-analyzing…" : "↻ Re-analyze with feedback"}
        </Button>
      </FeatureCard>

      {/* Approve */}
      <FeatureCard surface="obsidian" padding="md" className="text-paper-white">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-caption font-medium uppercase opacity-60 mb-1">
              Approved?
            </p>
            <p className="text-body">
              Approve to send the analysis to the Builder, which turns it
              into a generalized, runnable skill.
            </p>
          </div>
          <Button variant="light" size="md" onClick={onApprove}>
            ✓ Approve & build →
          </Button>
        </div>
      </FeatureCard>

      {analysis.feedbackLog.length > 0 && (
        <FeatureCard surface="paper-white" padding="sm" className="hairline">
          <details>
            <summary className="text-caption text-obsidian/60 cursor-pointer">
              {analysis.feedbackLog.length} feedback round{analysis.feedbackLog.length === 1 ? "" : "s"} applied
            </summary>
            <div className="mt-2 space-y-2">
              {analysis.feedbackLog.map((f, i) => (
                <FeedbackLogRow key={i} entry={f} />
              ))}
            </div>
          </details>
        </FeatureCard>
      )}
    </div>
  );
}

function FeedbackLogRow({ entry }: { entry: FeedbackEntry }) {
  return (
    <div className="text-caption text-obsidian/70 border-l-2 border-iron pl-2">
      <span className="font-mono">r{entry.revision}</span>
      {entry.overall ? <span className="ml-2">{entry.overall}</span> : null}
      {entry.steps.length > 0 && (
        <ul className="ml-4 mt-1 list-disc">
          {entry.steps.map((s, i) => (
            <li key={i}>
              <span className="font-mono">{s.stepId}</span>: {s.note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
