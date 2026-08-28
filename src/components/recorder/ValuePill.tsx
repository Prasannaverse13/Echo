"use client";

/**
 * ValuePill — inline `{{id}}` token renderer / editor.
 *
 * The Builder writes step text with `{{value_id}}` placeholders (e.g.
 * "Read `{{expense_csv_path}}` and parse each row"). The plan-review UI
 * shows each token as an editable pill — the user clicks to change the
 * underlying value, the surrounding text re-renders via `renderValues()`.
 *
 * This is the same pattern as Microsoft's Skill Recorder
 * (`common/values.ts` + the review-UI pill renderer).
 *
 * Two modes:
 *   - `<ValuePill id="..." values={...} fallback="..." />` — pure display
 *     of the resolved value. No interaction.
 *   - With `onChange` — clicking opens a popover with the editable value
 *     and a "Save" button. Used in the plan review.
 *
 * For now we use a native `<input type="text">` instead of a popover for
 * speed of shipping — the visual is clean enough.
 */

import * as React from "react";
import type { SkillValue } from "@/lib/recorder/builder-schema";
import { renderValues, tokenize } from "@/lib/recorder/tokens";

export interface ValuePillProps {
  /** The raw template text (may contain `{{id}}` tokens). */
  text: string;
  /** All values declared in the plan. */
  values: readonly SkillValue[];
  /** Called when a value pill is edited by the user. */
  onChange?: (id: string, value: string) => void;
  /** Fallback text when a token has no matching value. */
  missingText?: string;
  /** className for the wrapping inline-block. */
  className?: string;
}

/**
 * Renders a single string with `{{id}}` tokens shown as pills. Inline —
 * meant to be used inside paragraphs and step text.
 */
export function InlineTokenizedText({
  text,
  values,
  onChange,
  missingText = "?",
  className,
}: ValuePillProps) {
  const segments = React.useMemo(() => tokenize(text), [text]);
  const valueById = React.useMemo(() => {
    const m = new Map<string, SkillValue>();
    for (const v of values) m.set(v.id.toLowerCase(), v);
    return m;
  }, [values]);

  return (
    <span className={className}>
      {segments.map((seg, i) => {
        if (seg.kind === "text") {
          return <React.Fragment key={i}>{seg.text}</React.Fragment>;
        }
        const v = valueById.get(seg.id.toLowerCase());
        if (!v) {
          // Unknown / unresolved token — flag in the UI.
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-caption font-mono mx-0.5"
              title={`No value declared for {{${seg.id}}}`}
            >
              <span aria-hidden>⚠</span>
              {`{{${seg.id}}}`}
            </span>
          );
        }
        if (!onChange) {
          // Read-only display.
          return (
            <span
              key={i}
              className="inline-flex items-center px-1.5 py-0.5 rounded bg-mist-mint/20 text-obsidian text-caption font-medium mx-0.5"
              title={`${v.name}: ${v.value}`}
            >
              {v.value}
            </span>
          );
        }
        // Editable pill.
        return (
          <ValuePillEditor
            key={i}
            value={v}
            onChange={(nv) => onChange(seg.id, nv)}
            missingText={missingText}
          />
        );
      })}
    </span>
  );
}

interface ValuePillEditorProps {
  value: SkillValue;
  onChange: (newValue: string) => void;
  missingText: string;
}

function ValuePillEditor({ value, onChange, missingText: _missingText }: ValuePillEditorProps) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value.value);

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value.value) onChange(draft);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            if (draft !== value.value) onChange(draft);
            setEditing(false);
          } else if (e.key === "Escape") {
            setDraft(value.value);
            setEditing(false);
          }
        }}
        title={value.name}
        className="inline-block w-auto min-w-[6ch] max-w-[20ch] px-1.5 py-0.5 rounded bg-paper-white border border-obsidian text-caption font-mono mx-0.5 focus:outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value.value);
        setEditing(true);
      }}
      title={`${value.name} — click to edit`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-mist-mint/30 hover:bg-mist-mint/50 text-obsidian text-caption font-medium mx-0.5 transition-colors"
    >
      {value.value || <span className="text-obsidian/40">empty</span>}
      <span aria-hidden className="text-obsidian/40 text-[10px]">✎</span>
    </button>
  );
}

/**
 * Convenience helper: render a multi-line string (e.g. step text) with
 * paragraph breaks preserved.
 */
export function TokenizedParagraph({
  text,
  values,
  onChange,
}: Omit<ValuePillProps, "className">) {
  return (
    <p className="text-body-sm leading-relaxed">
      <InlineTokenizedText text={text} values={values} onChange={onChange} />
    </p>
  );
}

/**
 * Pure function — re-render a string with all `{{id}}` tokens substituted.
 * Used when the user edits a value pill and we need to re-render the
 * surrounding step text.
 */
export { renderValues };
