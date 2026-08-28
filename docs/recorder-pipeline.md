# Echo Recorder → SKILL.md pipeline

Indepth analysis of how Microsoft's [skill-recorder](https://github.com/microsoft/skill-recorder)
implements `Record → SKILL.md` and a phased plan for bringing Echo's `/record` flow up to
the same standard.

Last updated: 2026-08-28.

---

## 1. Why this matters

Our current `/record` flow does a **one-shot Gemini call** on the full webm video and asks
for a JSON shape with `steps[]`. That works for a 60-second demo but has three real
problems:

1. **No human review of the analysis before it becomes a skill.** Whatever Gemini hallucinates
   ends up saved. The user can edit it, but they're editing *post-hoc* — the *intent* itself
   was never confirmed, and there's no "this step is wrong" loop.
2. **No generalization.** The "procedure" the user sees in the skill.md is a literal description
   of one run. There's no separation between *fixed values* (the canonical blog URL,
   the sheet ID) and *dynamic inputs* (the query, the date range). No `{{token}}` system,
   no iteration-over-collection. So a recording of "search LinkedIn for AI jobs, past 24h"
   doesn't generalize to "search LinkedIn for {{job_query}}, past {{date_range}}".
3. **No native-tool mapping.** The procedure just says "search LinkedIn". It doesn't say
   *which* of Echo's actual capabilities should do it (real headless browser? Slack post?
   sheets append?). So the saved skill is un-runnable until the user manually wires it.

Microsoft solves all three with a 4-stage pipeline: **Record → Timeline → Describer → Builder → SKILL.md**, with **human approval gates** between Describer and Builder, and between Builder and final SKILL.md.

---

## 2. What Microsoft actually does

### 2.1 Record (local, no cloud)

Captures 4 streams in parallel, all on-device, all kept local until the user clicks Analyze:

| Stream | How | Why |
| --- | --- | --- |
| Screen video | `desktopCapturer` (Electron Chromium) | Visual evidence for ambiguous steps |
| Window/app activation | `app.activate` / `app.title-change` events | PRIMARY signal for "what app the user is in" |
| Browser URL | `browser.url` events (per-tab poll) | PRIMARY signal for "what page they're on" |
| Clipboard | `clipboard.change` events with short text preview | Ties steps together (copy here → paste there) |
| Narration (opt) | Mic + on-device Whisper (any of 99 langs) | The single most direct statement of intent |
| Terminal (opt) | `terminal.command` events | Shell workflow capture |

> **Critical privacy note**: the user is warned *before every recording* that "passwords,
> tokens, API keys, credentials, and other confidential information should never be recorded".
> On-screen text in frames is OCR'd and blurred (via `frame-redact.ts`) before any frame
> leaves the device. This is `Advanced protection` in the UI; default off, opt-in per session.

### 2.2 Bundle (deterministic, no LLM)

`common/correlation.ts` runs as a pure function over the raw event stream and produces a
**SessionBundle** that the LLM consumes. It does two things:

1. **Segments the timeline** into "steps" by detecting boundary events: `app-change`,
   `url-change`, `terminal-command`, or session start. Each step is `{index, startMs, endMs,
   durationMs, app, titles, hosts, urls, commands, clipboardCount, markers, frames, summary}`.
2. **Correlates frames to events**: each frame gets the active app/url/title at its
   timestamp + the nearest meaningful events in a ±1.5s window. Frames with no nearby
   meaning event are flagged `unexplained`; events with no nearby frame are flagged `silent`.
   This drives an adaptive probe loop that re-records those windows at higher density.

This is the **deterministic input contract** for the LLM. Without it, the LLM would have to
re-infer the structure from a wall of timestamps.

### 2.3 Describer (LLM, multi-turn)

`electron/describer/` is a Copilot CLI agent with a **tool surface** it can call:

- `get_timeline` — returns the segmented bundle (one call gives the agent the shape of the session).
- `get_events({types?, fromMs?, toMs?})` — the raw event stream, windowed.
- `get_narration({query?})` — the user's own words, timestamped.
- `list_frames` — index of available frames.
- `get_frames({fromMs, toMs, fps?, crop?, reason?})` — sample and **view** frames inline (the LLM literally sees the screen).
- `submit_analysis({title, intent, intentConfidence, intentRationale, steps[]})` — the **required final action**, exactly once per turn.

**The instructions explicitly tell the agent:**

- "Read the timeline first. Then narration (if any). Then form a hypothesis about intent.
  Only look at frames where events are silent or ambiguous. Budget ~5 frames for a 30-60s session."
- "Stay on-task: drop detours the intent rules out." (don't transcribe every URL hop — only the ones that serve the intent)
- "When the narration states a goal to build, not a task performed" (e.g. "I want an automation
  that…"), make the intent the goal itself, not "researched what to build".
- "Write step titles in past tense addressed to the user, not imperative or third person"
  ("Searched Google for 'atomic habits'", not "Search…" or "User searched…").
- "Treat feedback as authoritative. Re-examine, then call submit_analysis again."

**The output schema:**

```ts
{
  title: "Research Habit Articles",           // 2-5 words, scannable
  intent: "Research and compare articles on building better habits",
  intentConfidence: "high" | "medium" | "low",
  intentRationale: "Navigated from the technical guide to the blog post, copied a passage, then searched Google for it.",
  steps: [{
    id: "s1",
    title: "Searched Google for 'atomic habits'",
    detail: "Opened Google and entered the search query 'atomic habits'.",
    startMs: 1200, endMs: 5400,
    apps: ["Google Chrome"],
    evidence: ["google.com/search?q=atomic+habits"],
    confidence: "high",
  }, ...]
}
```

**Why multi-turn**: the user can give natural-language feedback ("step 3 is irrelevant,
you missed the step where I clicked Save") and the agent re-analyzes. The UI shows the
analysis with per-step comments and an overall comment field. The analysis is **only
considered approved** when the user explicitly hits the approve button.

### 2.4 Builder (LLM, two-phase, only after approval)

`electron/skillbuilder/` is a *second* agent that takes the **approved** analysis and turns
it into a **generalized, runnable** skill. It has its own tool surface:

- `get_analysis` — read the approved intent + steps.
- `get_timeline` — for evidence on which native tools to map.
- `propose_plan({name, title, description, summary, generalization, values, steps, allowedTools})` — show the plan, stop, wait for user.
- `submit_skill({name, description, allowedTools, body})` — write the final SKILL.md, only when the user approves.

**The plan schema:**

```ts
{
  name: "submit-expense-records",        // kebab-case slug
  title: "Submit expense records",
  description: "Submit pending expense records to the finance system",  // TRIGGER-ORIENTED
  summary: "Reads an expense CSV, validates each row, then posts each to the system.",
  generalization: "Iterates over every row in the expense CSV; the 3 rows in the recording are illustrative.",
  values: [                              // FIXED LITERALS → {{id}} tokens
    { id: "expense_csv_path", name: "Expense CSV path", value: "~/Downloads/expenses.csv" },
    { id: "finance_api_url", name: "Finance API URL", value: "https://api.finance.example.com" },
  ],
  steps: [
    { kind: "calculation", title: "Read the expense CSV", text: "Read `{{expense_csv_path}}` and parse each row as {date, vendor, amount, category}.",
      tool: "file_read" },
    { kind: "calculation", title: "Validate rows", text: "Skip rows with missing date or non-positive amount. Keep a list of `rejected_rows` for the user to review.",
      tool: "" },
    { kind: "action", title: "POST each row to the finance API", text: "For each accepted row, POST to `{{finance_api_url}}/expenses` with the row as the JSON body. Capture the response id.",
      tool: "http_post" },
  ],
  allowedTools: ["Bash(gh *)", "Bash(curl *)", "Read", "Write"],
}
```

**The build output** (`submit_skill`):

```ts
{
  name: "submit-expense-records",
  description: "Submit pending expense records to the finance system",  // becomes frontmatter
  allowedTools: ["Bash(gh *)", "Bash(curl *)", "Read", "Write"],
  body: "Read {{expense_csv_path}}…\nFor each row, POST to {{finance_api_url}}/expenses…",  // SKILL.md body
  // ^ token values are substituted at render time by renderValues()
}
```

**The two phases matter because:**
- The plan is editable. The user can say "use the `workiq_search_chats` tool instead of bash",
  "split step 3 into two steps", "add a `{{date_range}}` value". Each refinement is a new
  `propose_plan` call, not a re-roll of the whole thing.
- The substitution is **deterministic at the render boundary**. Edit a value pill in the UI;
  the `{{id}}` token text is the same in the saved body; render substitutes at export time.
  No second LLM turn is needed to honor an edit.

### 2.5 SKILL.md output (deterministic render)

`renderSkillMarkdown(skill)` produces:

```yaml
---
name: submit-expense-records
description: "Submit pending expense records to the finance system"
allowed-tools:
  - Bash(gh *)
  - Bash(curl *)
---

Read ~/Downloads/expenses.csv and parse each row as {date, vendor, amount, category}.

For each accepted row, POST to https://api.finance.example.com/expenses with the row as the JSON body.
…
```

The description is emitted as a JSON-stringified YAML double-quoted scalar so colons/commas
don't break parsing. The body is `renderValues(skill.body, skill.values)` — every `{{id}}`
is substituted with its `value`. Unresolved tokens (referenced in body but missing from
`values[]`) are **left untouched** and surfaced in the UI as a validation error.

### 2.6 What this is NOT

- **Not literal replay.** The pipeline aggressively generalizes: "submitted 3 rows" becomes
  "for each row in N".
- **Not browser-only.** Where a CLI exists, it is preferred. `gh` over GitHub web; `git` over
  any GUI; `workiq` over Teams search. Browser automation is the *fallback* for genuine
  UI-only services, not the default.
- **Not a transcript.** A step doesn't say "clicked the search button" — it says "search
  for `{{query}}` on `{{source_url}}`".
- **Not a single LLM call.** Both Describer and Builder are multi-turn. The user is always
  in the loop. Review gates are explicit UI states.

---

## 3. What Echo has today

Our `/record` flow:

1. **Capture** — `getDisplayMedia` for a screen share, recorded as webm via `MediaRecorder`.
   Also samples 1 fps JPEGs into `frameBlobsRef` (a fallback path for when video upload fails).
   No clipboard, no URL, no narration, no app detection. **What the user does in other apps
   is invisible to us** unless they shared that screen.
2. **Upload** — POSTs the webm data URL to `/api/skills/reconstruct` (60s maxDuration).
3. **Reconstruct** — server sends the whole webm to Gemini 3.5 Flash with one prompt asking
   for `{suggestedName, suggestedDescription, intent, steps[], triggers, integrations}`.
4. **Review** — user sees the result, can edit any field, hits Save.
5. **Persist** — localStorage + best-effort Firestore.
6. **Export** — `generateSkillFromRecord` produces an operational skill.md.

**The shape we get back is roughly equivalent to a *Describer output* collapsed into one shot.**
There is no Builder phase, no `{{id}}` tokens, no allowed-tools, no native-tool mapping,
no iteration-over-collection generalization, no review gate before SKILL.md is generated.

---

## 4. The gap, mapped

| Microsoft | Echo | Status |
| --- | --- | --- |
| Multi-stream capture (app, URL, clipboard, narration) | Screen video only | **Missing for browser-external activity** |
| Deterministic bundle / correlation | None | **Missing** — we feed raw video to Gemini |
| Describer (multi-turn, tool-using) | One-shot Gemini call | **Replace with multi-stage** |
| Analysis schema (title/intent/confidence/rationale/steps) | Bare `steps[]` | **Extend** |
| **Human approval gate** between describer and skill | Implicit (user edits) | **Add explicit "Approve analysis → build skill"** |
| **Plan → user review → submit** builder | None | **Add a builder stage** |
| `{{id}}` value tokens + render-time substitution | None | **Add a token system** |
| Calculation vs action step kind | Single "step" | **Add side-effect classification** |
| Native-tool mapping (with a catalogue) | None | **Add a small tool catalogue (echo-skills) per skill** |
| `allowed-tools` frontmatter | None | **Add** |
| Two-phase user feedback (revise plan) | One-shot | **Add a plan revision chat** |
| Evals for describer + builder | None | **Add a fixture-based eval harness** |
| Sensitive redaction (OCR + blur) | None | **Defer to v2 — privacy policy is "don't type secrets"** |

---

## 5. The plan: what we build, in phases

I'm proposing 4 phases, ordered so that each ships standalone and the user can stop after
any phase. **Phase 0** is a refactor of the existing flow; **Phase 1** adds the analysis
review gate; **Phase 2** adds the builder + tokens; **Phase 3** is quality + eval.

### Phase 0 — Tighten the existing one-shot (no user-visible change)

Goal: make the current `/api/skills/reconstruct` produce output that's *shaped like* a
Describer output, so Phase 1 is a UI change, not a data change.

- Update the Gemini prompt to ask for the full Describer schema:
  `{title, intent, intentConfidence, intentRationale, steps: [{id, title, detail,
  startMs?, endMs?, apps[], evidence[], confidence}]}` instead of the current flat shape.
- Save that exact shape to localStorage and Firestore under a new
  `SkillRecord.analysis: AnalysisSubmission` field.
- The existing review UI just keeps working — it already shows name/description/steps.

**Shipped value**: zero, but the data is now ready for Phase 1.

### Phase 1 — Analysis review gate (the "Describer → human → Builder" split)

Goal: split the current single review into **two reviews**: Analysis (intent + steps) and
Skill (the SKILL.md body).

- Add a new `analysis: { title, intent, intentConfidence, intentRationale, steps[], feedbackLog[] }`
  type alongside the existing `SkillRecord`.
- Refactor `/record` page into 3 phases: `recording → analysis_review → skill_review`.
- The `analysis_review` shows:
  - The reconstructed title
  - The one-sentence intent (editable, with `intentConfidence` badge)
  - The rationale (editable, in a smaller font)
  - Each step (editable title + detail; can be deleted; can be reordered; has a confidence badge)
  - An "overall feedback" text box + a per-step feedback box
  - **Approve** button → goes to `skill_review`; **Re-analyze with feedback** button → re-runs the describer with feedback appended to `feedbackLog`; **Edit steps inline** button → toggles inline editing
- The `skill_review` keeps the current "Edit name/description/steps + Save" UI but now also
  shows what the SKILL.md will look like.

**Implementation**:
- `src/lib/recorder/describer.ts` — pure function that calls Gemini with the
  `DescriberPrompt` and the current analysis+feedback, returns the new analysis.
  Lives on the server (`/api/skills/analyze`) so the API key isn't exposed.
- `src/lib/recorder/analysis-schema.ts` — zod schema (yes, we now have zod) for the
  analysis type, lifted from MS.
- `src/app/record/page.tsx` — refactor phases; add the `analysis_review` state.
- `src/components/recorder/AnalysisReview.tsx` — the new component.

**Shipped value**: the user can now see and correct *what the agent thinks the intent is*
*before* it becomes a skill. Major quality improvement for almost no extra work.

### Phase 2 — Builder, plan review, and `{{id}}` tokens

Goal: turn the approved analysis into a **generalized, runnable** skill with editable
fixed values, side-effect classification, and a tool mapping.

- New `src/lib/recorder/builder.ts` (server-side) — the Builder agent prompt.
  Input: the approved analysis. Output: a `SkillPlan` with
  `{generalization, values[], steps[{kind, title, text, tool}], allowedTools}`.
- New `/api/skills/build` route. Returns the plan. The user reviews it.
- Refactor the skill_review phase into a real **plan review**:
  - Top: a one-line **generalization** statement (e.g. "Iterates over all N rows, not just
    the 3 in the recording").
  - Below: a list of **value pills** — each is `{id, name, value}`. The user can change a
    value; the `{{id}}` references in the steps below update via `renderValues()`.
  - Below that: the **step list** — each step has a `kind` badge ("calculation" or "action"),
    a tool badge ("browser_run" / "slack_post" / etc.), an editable title, an editable body
    that may contain `{{value_id}}` tokens (rendered as pills inline).
  - An "allowed tools" editable list (frontmatter).
  - A **chat input** at the bottom: "use slack_post instead of browser_run for step 2",
    "add a step that pings me on Slack when done", "the {{date_range}} should default to
    `past 24 hours`". The chat re-runs the Builder with the new plan context.
  - **Approve** button → renders the final SKILL.md and goes to the existing Save UI.
- New `src/lib/recorder/tokens.ts` — port of MS's `tokenize` / `renderValues` /
  `unresolvedTokens` from `common/values.ts`.
- New `src/lib/recorder/tool-catalogue.ts` — a small JSON catalogue of Echo's existing
  tool capabilities: `{ id, name, description, whenToUse, params }`. Used by the Builder
  prompt to pick the right tool. Initial entries: `browser_run`, `browser_extract`,
  `slack_post`, `sheets_append`, `drive_upload`, `gmail_draft`, `hubspot_note`.
- `generateSkillFromRecord` is **rewritten** to take a `BuiltSkill` (the new shape) and
  produce the same SKILL.md frontmatter that Microsoft does. The existing localStorage
  shape gets a `built: { name, description, allowedTools, body }` field next to `analysis`.

**Shipped value**: the saved skill is now **generalized** and **runnable**. "Search LinkedIn
for {{job_query}}, past {{date_range}}" works on inputs the user has never typed. The
`allowed-tools` frontmatter becomes the permission scope when the skill is dispatched.

### Phase 3 — Quality + evals

Goal: know whether the LLM is doing a good job, and iterate.

- `src/lib/recorder/evals/` — a fixture-based eval harness. Each fixture is a synthetic
  event timeline + ground-truth analysis + ground-truth plan. Score: JSON diff on the
  analysis schema; substring match on key plan fields; "did the LLM generalize" check.
- `pnpm run eval:recorder` — runs the eval against the configured Gemini model.
- A 3-fixture seed set in `src/lib/recorder/evals/fixtures/` covering: (a) a 3-row
  sheet submission (proves iteration), (b) a search-with-time-range (proves tokenization),
  (c) a paste-into-form (proves copy-paste as a step).
- `describer-eval` score in the dashboard — a single "skill quality" number derived from
  the most recent eval run.

---

## 6. What we explicitly do NOT do

- **No Electron port.** Echo is a web app; we don't ship a desktop binary. The user installs
  nothing; the recorder lives at `/record`.
- **No local Whisper.** The web page can record the mic (`MediaRecorder`), but on-device
  transcription is browser-API-quirky. We use OpenAI `gpt-4o-transcribe` server-side for v1.
  Swap to on-device later if needed.
- **No OCR-based PII redaction in v1.** The recorder's privacy story is **"don't type
  secrets into a recorded screen"** with a pre-recording warning. The MS Advanced protection
  is a v2 feature.
- **No automatic conversion of a recorded skill to a trigger/schedule.** That's a
  separate "AutomationBuilder" concern (see `electron/automationbuilder/` in MS) and is
  out of scope for this work. We can do it in a future phase.

---

## 7. Key files to be created / modified

**New**:
- `src/lib/recorder/analysis-schema.ts` — the analysis zod schema.
- `src/lib/recorder/builder-schema.ts` — the plan/built zod schemas.
- `src/lib/recorder/describer.ts` — server-side describer prompt + Gemini call.
- `src/lib/recorder/builder.ts` — server-side builder prompt + Gemini call.
- `src/lib/recorder/tokens.ts` — `tokenize` / `renderValues` / `unresolvedTokens`.
- `src/lib/recorder/tool-catalogue.ts` — Echo's tool capabilities.
- `src/app/api/skills/analyze/route.ts` — describer endpoint (with feedback support).
- `src/app/api/skills/build/route.ts` — builder endpoint (with plan revision support).
- `src/components/recorder/AnalysisReview.tsx` — analysis review UI.
- `src/components/recorder/PlanReview.tsx` — plan review UI with editable pills.
- `src/components/recorder/ValuePill.tsx` — the inline `{{id}}` token pill.
- `src/lib/recorder/evals/` — fixture + harness (Phase 3).

**Modified**:
- `src/app/(dashboard)/record/page.tsx` — refactor phases, add analysis_review + plan_review.
- `src/lib/client/skill-md.ts` — add `generateBuiltSkill` (or rewrite the existing one).
- `src/lib/client/stores.ts` — add `analysis`, `built`, `values` to `SkillRecord`.
- `src/app/api/skills/reconstruct/route.ts` — Phase 0: emit the new schema; later, just a thin wrapper over `/analyze`.

---

## 8. Open questions for the user

1. **Phasing**: do all 4 phases, or stop after Phase 1? Phase 2 is the biggest visible
   quality jump but the most work.
2. **Tool catalogue scope**: should the Builder be allowed to map steps to *any* of Echo's
   integrations, or only to a whitelisted subset (browser_run, sheets_append, slack_post)?
3. **Narration**: ship the mic + OpenAI transcription in Phase 1, or defer to Phase 2
   alongside the builder?
4. **Evals**: are we running real evals or is "manual smoke test on 3 workflows" enough
   for now?
5. **Pre-existing skills**: when we change the schema, do we migrate the existing
   `SkillRecord`s in localStorage, or just leave them and let them download as before?

(All five are reversible decisions; we can change course mid-Phase 1 if needed.)
