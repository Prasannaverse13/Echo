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

  // ---- Fixture 4: email draft with named recipient + subject ------------
  {
    name: "Draft a welcome email to a new lead",
    what: "User drafted a welcome email to a specific lead. The recipient, subject, and lead-name must all be tokens, not literals.",
    analysis: {
      version: 1,
      sessionId: "fixture_email",
      revision: 1,
      createdAt: "2026-01-01T00:00:00Z",
      title: "Draft Welcome Email",
      intent: "Draft a welcome email to a new lead when their status changes to 'new' in HubSpot.",
      intentConfidence: "high",
      intentRationale: "Opened Gmail compose, addressed it to jane.doe@acme.com, used subject 'Welcome to Acme', and pasted a 3-line template body addressing Jane as the new lead.",
      steps: [
        {
          id: "s1",
          title: "Opened Gmail compose",
          detail: "Clicked Compose in Gmail.",
          apps: ["Gmail"],
          evidence: [],
          confidence: "high",
        },
        {
          id: "s2",
          title: "Entered recipient",
          detail: "Typed jane.doe@acme.com in the To field.",
          apps: ["Gmail"],
          evidence: ["to: jane.doe@acme.com"],
          confidence: "high",
        },
        {
          id: "s3",
          title: "Set the subject",
          detail: "Entered 'Welcome to Acme' as the subject line.",
          apps: ["Gmail"],
          evidence: ["subject: Welcome to Acme"],
          confidence: "high",
        },
        {
          id: "s4",
          title: "Wrote the body",
          detail: "Wrote a 3-line body: 'Hi Jane, welcome to Acme! Your account manager will be in touch within 24 hours. - The team'",
          apps: ["Gmail"],
          evidence: ["clipboard.copy / typed body"],
          confidence: "high",
        },
        {
          id: "s5",
          title: "Saved as draft",
          detail: "Clicked the more menu and chose 'Save as draft' (did not send).",
          apps: ["Gmail"],
          evidence: [],
          confidence: "high",
        },
      ],
      feedbackLog: [],
      approved: true,
    },
    expectedPlan: {
      generalization: "Drafts a welcome email for any new lead; the recipient, subject, and body template are all parameterized per-lead.",
      values: [
        { id: "recipient_email", name: "Recipient email", value: "(the lead's email)" },
        { id: "subject", name: "Subject line", value: "Welcome to Acme" },
        { id: "lead_name", name: "Lead first name", value: "(the lead's first name)" },
        { id: "body_template", name: "Body template", value: "Hi {{lead_name}}, welcome to Acme! Your account manager will be in touch within 24 hours. - The team" },
      ],
    },
    expectedTokens: ["recipient_email", "subject", "lead_name"],
    forbiddenPhrases: [
      "jane.doe@acme.com",
      "jane.doe",
      "jane@acme.com",
      "Welcome to Acme",
    ],
    expectedTools: ["gmail_draft"],
    minSteps: 3,
  },

  // ---- Fixture 5: filter + iteration ------------------------------------
  {
    name: "Filter a sheet to a subset and email the row count",
    what: "User filtered a sheet for rows where status='open' and posted the count to Slack. The status, count threshold, and channel must be tokens.",
    analysis: {
      version: 1,
      sessionId: "fixture_filter",
      revision: 1,
      createdAt: "2026-01-01T00:00:00Z",
      title: "Filter Sheet And Post Count",
      intent: "Filter a sheet to rows matching a condition and post the row count to a Slack channel.",
      intentConfidence: "high",
      intentRationale: "Opened a sheet, applied the filter status='open', counted the matching rows (12), then posted '12 open rows' to #ops-alerts.",
      steps: [
        {
          id: "s1",
          title: "Opened the tracker sheet",
          detail: "Opened the operations tracker sheet.",
          apps: ["Google Sheets"],
          evidence: [],
          confidence: "high",
        },
        {
          id: "s2",
          title: "Filtered to status='open'",
          detail: "Applied the filter status='open' to the status column.",
          apps: ["Google Sheets"],
          evidence: ["filter: status=open"],
          confidence: "high",
        },
        {
          id: "s3",
          title: "Counted the matching rows",
          detail: "Read the row count: 12 matching rows.",
          apps: ["Google Sheets"],
          evidence: ["count=12"],
          confidence: "high",
        },
        {
          id: "s4",
          title: "Posted to #ops-alerts",
          detail: "Posted '12 open rows' to the Slack channel #ops-alerts.",
          apps: ["Slack"],
          evidence: ["slack: #ops-alerts '12 open rows'"],
          confidence: "high",
        },
      ],
      feedbackLog: [],
      approved: true,
    },
    expectedPlan: {
      generalization: "Filters the sheet to any status value and posts the count to any channel; the 12 rows and #ops-alerts are illustrative.",
      values: [
        { id: "status_filter", name: "Status filter value", value: "open" },
        { id: "slack_channel", name: "Slack channel", value: "#ops-alerts" },
        { id: "sheet_id", name: "Tracker sheet id", value: "(the sheet id)" },
      ],
    },
    expectedTokens: ["status_filter", "slack_channel"],
    forbiddenPhrases: ["12 rows", "12 open", "the 12 rows", "ops-alerts"],
    expectedTools: ["sheets_read", "echo_filter", "slack_post"],
    minSteps: 3,
  },

  // ---- Fixture 6: date-range / time-window -----------------------------
  {
    name: "Weekly metrics summary posted to Slack",
    what: "User pulled metrics for the last 7 days and posted a summary. The time window and channel are tokens; the specific metric names should also be parameterized if they vary by team.",
    analysis: {
      version: 1,
      sessionId: "fixture_metrics",
      revision: 1,
      createdAt: "2026-01-01T00:00:00Z",
      title: "Weekly Metrics To Slack",
      intent: "Pull last week's metrics and post a summary to a Slack channel.",
      intentConfidence: "high",
      intentRationale: "Read the metrics sheet for the last 7 days, ranked rows by change, picked the top 3 wins, and posted a 5-line summary to #team-updates.",
      steps: [
        {
          id: "s1",
          title: "Read the metrics sheet",
          detail: "Read the operations metrics sheet.",
          apps: ["Google Sheets"],
          evidence: [],
          confidence: "high",
        },
        {
          id: "s2",
          title: "Filtered to last 7 days",
          detail: "Filtered rows to the past 7 days.",
          apps: ["Google Sheets"],
          evidence: ["filter: last 7 days"],
          confidence: "high",
        },
        {
          id: "s3",
          title: "Picked the top 3 wins",
          detail: "Ranked rows by absolute change and selected the top 3 wins.",
          apps: ["Google Sheets"],
          evidence: [],
          confidence: "medium",
        },
        {
          id: "s4",
          title: "Drafted the summary",
          detail: "Wrote a 5-line summary in the team's voice.",
          apps: ["Slack"],
          evidence: [],
          confidence: "medium",
        },
        {
          id: "s5",
          title: "Posted to #team-updates",
          detail: "Posted the summary to #team-updates.",
          apps: ["Slack"],
          evidence: ["slack: #team-updates"],
          confidence: "high",
        },
      ],
      feedbackLog: [],
      approved: true,
    },
    expectedPlan: {
      generalization: "Pulls metrics for any time window and posts the top N changes to any channel; the 7-day window and #team-updates are illustrative.",
      values: [
        { id: "time_window_days", name: "Time window (days)", value: "7" },
        { id: "top_n", name: "Top N rows to highlight", value: "3" },
        { id: "slack_channel", name: "Slack channel", value: "#team-updates" },
        { id: "metrics_sheet_id", name: "Metrics sheet id", value: "(the sheet id)" },
      ],
    },
    expectedTokens: ["time_window_days", "slack_channel"],
    forbiddenPhrases: ["last 7 days", "past 7 days", "team-updates", "the top 3"],
    expectedTools: ["sheets_read", "echo_filter", "slack_post"],
    minSteps: 3,
  },
];
