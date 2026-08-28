/**
 * Eval fixtures for the Skill Recorder pipeline.
 *
 * Each fixture represents a "ground truth" the describer / builder should
 * produce from a synthetic recording. The harness calls the live LLM with
 * the fixture's video / events / narration and scores the result against
 * the ground truth.
 *
 * We start with three seeds covering the three big-bucket failure modes
 * the Microsoft Skill Recorder evals target:
 *
 *   1. **Iteration over a collection** — the user submitted 3 rows of a
 *      sheet. The skill must handle N rows, not hardcode the 3.
 *
 *   2. **Dynamic value + parameterization** — the user searched with a
 *      specific query. The skill must use a `{{query}}` token, not the
 *      literal query string.
 *
 *   3. **Copy-paste as a step** — the user copied text in one app and
 *      pasted it into another. The skill must reflect the paste, even
 *      though no explicit "paste" event fires.
 *
 * To keep the fixture set small, we omit the video for now (the LLM
 * doesn't need it to score a Plan against a known Intent — the analysis
 * has to be hand-supplied). The point of the eval is to score the
 * BUILDER's generalization, not the Describer's video-understanding
 * (which we can't reasonably synthesize without a real recording).
 *
 * Run with: `pnpm run eval:recorder`
 */

import type { Analysis } from "../analysis-schema";
import type { SkillPlan } from "../builder-schema";

export interface BuilderFixture {
  /** Short human label for the fixture list. */
  name: string;
  /** 1-2 sentence description of what the user did. */
  what: string;
  /** The ground-truth analysis the user "approved". */
  analysis: Analysis;
  /** The plan the Builder should produce from the analysis. */
  expectedPlan: Partial<SkillPlan>;
  /** Specific tokens the plan must reference. */
  expectedTokens: string[];
  /** Phrases the plan body / steps must NOT contain (anti-patterns). */
  forbiddenPhrases?: string[];
  /** Specific tool ids the plan must use. */
  expectedTools?: string[];
  /** Minimum number of steps. */
  minSteps?: number;
  /** If true, the plan must use a "browser" kind. */
  expectBrowser?: boolean;
}

export const FIXTURES: BuilderFixture[] = [
  // ---- Fixture 1: iteration over a collection (sheet rows) ---------------
  {
    name: "Submit expense records (3 → N rows)",
    what: "User submitted 3 rows of a Google Sheet to a finance API. The skill must generalize to N rows.",
    analysis: {
      version: 1,
      sessionId: "fixture_expense",
      revision: 1,
      createdAt: "2026-01-01T00:00:00Z",
      title: "Submit Expense Records",
      intent: "Submit pending expense records from a Google Sheet to the finance system.",
      intentConfidence: "high",
      intentRationale: "Opened a sheet, read 3 rows, submitted each to the finance API via curl.",
      steps: [
        {
          id: "s1",
          title: "Opened the expense sheet",
          detail: "Opened the expense tracker sheet in Google Sheets and selected 3 rows.",
          apps: ["Google Sheets"],
          evidence: ["sheets.google.com"],
          confidence: "high",
        },
        {
          id: "s2",
          title: "Read the 3 rows",
          detail: "Read the date, vendor, amount, and category fields from each row.",
          apps: ["Google Sheets"],
          evidence: [],
          confidence: "high",
        },
        {
          id: "s3",
          title: "Submitted each row to the finance API",
          detail: "For each row, POSTed the JSON payload to https://api.finance.example.com/expenses via curl.",
          apps: ["Terminal"],
          evidence: ["curl -X POST https://api.finance.example.com/expenses"],
          confidence: "high",
        },
        {
          id: "s4",
          title: "Confirmed submission",
          detail: "Verified the finance system returned a 200 for each row.",
          apps: ["Terminal"],
          evidence: [],
          confidence: "medium",
        },
      ],
      feedbackLog: [],
      approved: true,
    },
    expectedPlan: {
      generalization:
        "Iterates over every row in the expense sheet; the 3 rows in the recording are illustrative — the skill handles N rows.",
      values: [
        { id: "finance_api_url", name: "Finance API URL", value: "https://api.finance.example.com" },
        { id: "expense_sheet_id", name: "Expense sheet id", value: "(the sheet id)" },
      ],
    },
    expectedTokens: ["finance_api_url"],
    forbiddenPhrases: ["the 3 rows", "three rows", "3 rows", "all 3", "row 1", "row 2", "row 3"],
    expectedTools: ["sheets_read"],
    minSteps: 3,
  },

  // ---- Fixture 2: dynamic value (search query) ---------------------------
  {
    name: "Search LinkedIn for AI jobs (literal → token)",
    what: "User searched LinkedIn for 'AI jobs' and filtered to Past 24 hours. The skill must parameterize the query and the time range.",
    analysis: {
      version: 1,
      sessionId: "fixture_linkedin",
      revision: 1,
      createdAt: "2026-01-01T00:00:00Z",
      title: "Search LinkedIn Jobs",
      intent: "Search LinkedIn for recent job postings matching a query.",
      intentConfidence: "high",
      intentRationale: "Opened LinkedIn jobs, entered 'AI jobs' in the search box, filtered to Past 24 hours.",
      steps: [
        {
          id: "s1",
          title: "Opened LinkedIn jobs",
          detail: "Navigated to linkedin.com/jobs.",
          apps: ["LinkedIn"],
          evidence: ["linkedin.com/jobs"],
          confidence: "high",
        },
        {
          id: "s2",
          title: "Entered 'AI jobs' in the search box",
          detail: "Typed the query 'AI jobs' into the LinkedIn job search field.",
          apps: ["LinkedIn"],
          evidence: [],
          confidence: "high",
        },
        {
          id: "s3",
          title: "Filtered to Past 24 hours",
          detail: "Selected 'Past 24 hours' from the date posted filter.",
          apps: ["LinkedIn"],
          evidence: [],
          confidence: "high",
        },
        {
          id: "s4",
          title: "Reviewed the results",
          detail: "Browsed the resulting job listings.",
          apps: ["LinkedIn"],
          evidence: [],
          confidence: "medium",
        },
      ],
      feedbackLog: [],
      approved: true,
    },
    expectedPlan: {
      generalization:
        "Searches LinkedIn for any job query, not just 'AI jobs'; the date filter is configurable per run.",
      values: [
        { id: "job_query", name: "Job search query", value: "AI jobs" },
        { id: "date_range", name: "Date range filter", value: "Past 24 hours" },
      ],
    },
    expectedTokens: ["job_query", "date_range"],
    forbiddenPhrases: ["AI jobs", "Past 24 hours"],
    expectedTools: ["browser_run", "browser_extract"],
    minSteps: 3,
    expectBrowser: true,
  },

  // ---- Fixture 3: copy-paste as a step ----------------------------------
  {
    name: "Copy article passage into a note (paste inferred)",
    what: "User copied a passage from a blog post and pasted it into Apple Notes. The skill must reflect the paste even though no explicit paste event fires.",
    analysis: {
      version: 1,
      sessionId: "fixture_clipboard",
      revision: 1,
      createdAt: "2026-01-01T00:00:00Z",
      title: "Save Article To Notes",
      intent: "Save passages from a web article to a personal note.",
      intentConfidence: "high",
      intentRationale: "Selected and copied a passage from a blog post, then pasted it into a new Apple Note.",
      steps: [
        {
          id: "s1",
          title: "Opened the blog post",
          detail: "Opened a blog post in Chrome.",
          apps: ["Google Chrome"],
          evidence: [],
          confidence: "high",
        },
        {
          id: "s2",
          title: "Selected and copied a passage",
          detail: "Selected a paragraph and copied it to the clipboard.",
          apps: ["Google Chrome"],
          evidence: ["clipboard.copy: 'Atomic Habits emphasizes small, consistent improvements…'"],
          confidence: "high",
        },
        {
          id: "s3",
          title: "Pasted into a new Apple Note",
          detail: "Created a new Apple Note and pasted the passage into it.",
          apps: ["Apple Notes"],
          evidence: [],
          confidence: "high",
        },
        {
          id: "s4",
          title: "Named the note",
          detail: "Titled the note 'Atomic Habits'.",
          apps: ["Apple Notes"],
          evidence: [],
          confidence: "medium",
        },
      ],
      feedbackLog: [],
      approved: true,
    },
    expectedPlan: {
      generalization:
        "Saves passages from any web article to a personal note; the specific article is not hardcoded.",
      values: [
        { id: "article_url", name: "Article URL", value: "(the article URL)" },
        { id: "note_title", name: "Note title", value: "(a title)" },
      ],
    },
    expectedTokens: ["article_url"],
    forbiddenPhrases: ["the specific passage", "this one blog post"],
    minSteps: 3,
  },
];
