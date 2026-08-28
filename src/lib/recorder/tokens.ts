/**
 * Token system — `{{id}}` placeholders in skill plan bodies.
 *
 * The Builder writes step text with `{{value_id}}` tokens (e.g.
 * "Read `{{expense_csv_path}}` and parse each row"). These are rendered as
 * editable pills in the plan-review UI; the literal substitution happens
 * deterministically at the SKILL.md render boundary, so editing a value
 * updates everywhere it's used without re-running the LLM.
 *
 * Pattern: `{{ id }}` (optional inner whitespace). id is `[a-z0-9_]+`,
 * case-insensitive. Unknown tokens are LEFT as-is and surfaced via
 * `unresolvedTokens()` for the UI to flag.
 */

import type { SkillValue } from "./builder-schema";

const TOKEN_RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export type TextSegment =
  | { kind: "text"; text: string }
  | { kind: "token"; id: string };

/** Split template text into literal + token segments. */
export function tokenize(text: string): TextSegment[] {
  const out: TextSegment[] = [];
  let last = 0;
  // Reset regex state (g flag) by recreating locally.
  const re = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ kind: "text", text: text.slice(last, at) });
    out.push({ kind: "token", id: m[1].toLowerCase() });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** The distinct token ids referenced in text, in first-seen order. */
export function tokenIds(text: string): string[] {
  const ids: string[] = [];
  const re = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
  for (const m of text.matchAll(re)) {
    const id = m[1].toLowerCase();
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Deterministically substitute `{{id}}` with the matching value's literal.
 * Unknown tokens are left untouched — call `unresolvedTokens()` to find them.
 */
export function renderValues(text: string, values: readonly SkillValue[]): string {
  if (!text) return text;
  const map = new Map(values.map((v) => [v.id.toLowerCase(), v.value]));
  const re = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
  return text.replace(re, (whole, id: string) => {
    const hit = map.get(id.toLowerCase());
    return hit === undefined ? whole : hit;
  });
}

/** Token ids referenced in text that have no matching declared value. */
export function unresolvedTokens(text: string, values: readonly SkillValue[]): string[] {
  const known = new Set(values.map((v) => v.id.toLowerCase()));
  return tokenIds(text).filter((id) => !known.has(id));
}

/**
 * Build the full set of `{{id}}` references across a plan (body + every step's
 * text + the description + the generalization). Used by the UI to warn the
 * user about values they haven't declared.
 */
export function allTokenReferences(parts: { body: string; description?: string; generalization?: string; stepTexts?: string[] }): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const collect = (s: string | undefined) => {
    if (!s) return;
    for (const id of tokenIds(s)) {
      if (!seen.has(id)) {
        seen.add(id);
        out.push(id);
      }
    }
  };
  collect(parts.body);
  collect(parts.description);
  collect(parts.generalization);
  for (const t of parts.stepTexts ?? []) collect(t);
  return out;
}
