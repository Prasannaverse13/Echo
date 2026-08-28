/**
 * Echo's tool catalogue.
 *
 * The Builder agent picks one `tool` per step from this list. The catalogue
 * is intentionally small — only Echo's actual, wired-up capabilities. The
 * `kind` field tells the agent which step types this tool is appropriate for.
 *
 *   - `calculation` steps: read, derive, decide, format. No external side effect.
 *   - `action` steps: change the world (send, post, write, append).
 *   - `browser` steps: genuinely need UI replay (LinkedIn search, HubSpot
 *     form submission to a non-API service, etc.).
 *
 * Native tools (the CLI / API ones) are listed first. Browser automation is
 * the escape hatch — used only when there's no equivalent native capability,
 * matching the Microsoft Skill Recorder's "prefer native over UI replay"
 * principle.
 *
 * Adding a new tool:
 *   1. Add an entry below.
 *   2. Make sure the runtime can dispatch it (see `src/lib/agents/echo-agent.ts`
 *      and `/api/browser/preview` for the headless-browser path).
 *   3. Update the allowed-tools validator to accept the new id.
 */

export interface ToolDef {
  /** Stable kebab-case id. Referenced by `PlanStep.tool` and `allowedTools[]`. */
  id: string;
  /** Human-friendly name for the UI dropdown. */
  name: string;
  /** One-line description for the Builder's planning prompt. */
  description: string;
  /** When this tool is the right choice. */
  whenToUse: string;
  /** Which step kinds this tool makes sense for. */
  kinds: Array<"calculation" | "action" | "browser">;
  /**
   * The `allowedTools` frontmatter token this maps to. Echo doesn't gate
   * execution on this yet (we trust the user), but we emit it in the SKILL.md
   * for portability to other agent runtimes.
   */
  allowedToolsToken: string;
}

export const TOOL_CATALOGUE: readonly ToolDef[] = [
  // ----- Native (non-browser) -----------------------------------------------
  {
    id: "gmail_draft",
    name: "Gmail — draft email",
    description: "Create a draft email in Gmail (never sends).",
    whenToUse: "When the workflow involves composing an email to send later.",
    kinds: ["action"],
    allowedToolsToken: "gmail.draft",
  },
  {
    id: "sheets_append",
    name: "Sheets — append row",
    description: "Append one or more rows to a Google Sheet (preserves existing data).",
    whenToUse: "When the workflow produces structured rows that should be added to a sheet.",
    kinds: ["action"],
    allowedToolsToken: "sheets.append",
  },
  {
    id: "sheets_read",
    name: "Sheets — read rows",
    description: "Read rows from a Google Sheet (filterable).",
    whenToUse: "When the workflow starts from a sheet of inputs and iterates over them.",
    kinds: ["calculation"],
    allowedToolsToken: "sheets.read",
  },
  {
    id: "drive_upload",
    name: "Drive — upload file",
    description: "Upload a file to a Google Drive folder.",
    whenToUse: "When the workflow produces a file (PDF, CSV, image) that should be saved.",
    kinds: ["action"],
    allowedToolsToken: "drive.upload",
  },
  {
    id: "slack_post",
    name: "Slack — post message",
    description: "Post a message to a Slack channel.",
    whenToUse: "When the workflow should notify a team or a person on Slack.",
    kinds: ["action"],
    allowedToolsToken: "slack.post",
  },
  {
    id: "hubspot_note",
    name: "HubSpot — append note to contact",
    description: "Append a note to a HubSpot contact record.",
    whenToUse: "When the workflow enriches or annotates a CRM record.",
    kinds: ["action"],
    allowedToolsToken: "hubspot.note",
  },
  {
    id: "notion_create",
    name: "Notion — create page",
    description: "Create a new Notion page with a given title and body.",
    whenToUse: "When the workflow produces a document / page / article.",
    kinds: ["action"],
    allowedToolsToken: "notion.create",
  },

  // ----- Pure reasoning / formatting ---------------------------------------
  {
    id: "echo_filter",
    name: "Filter / keep rows",
    description: "Read the upstream input, keep only the rows that match a condition.",
    whenToUse: "When the workflow should narrow a list before the next step.",
    kinds: ["calculation"],
    allowedToolsToken: "echo.filter",
  },
  {
    id: "echo_format",
    name: "Format / transform",
    description: "Re-shape a value (date, currency, casing, JSON) without a side effect.",
    whenToUse: "When the workflow transforms an upstream value before using it downstream.",
    kinds: ["calculation"],
    allowedToolsToken: "echo.format",
  },

  // ----- Browser automation (the escape hatch) -----------------------------
  {
    id: "browser_run",
    name: "Headless browser — navigate + screenshot",
    description:
      "Open a URL in a real headless Chromium and capture a screenshot. No interaction yet (Vercel Hobby 10s budget).",
    whenToUse:
      "When the workflow is on a public web page and we only need to see the current state.",
    kinds: ["browser", "calculation"],
    allowedToolsToken: "browser.run",
  },
  {
    id: "browser_extract",
    name: "Headless browser — extract text from page",
    description: "Navigate to a URL and extract the visible text content.",
    whenToUse: "When the workflow needs the body text of a public web page (e.g. an article, a job post).",
    kinds: ["calculation", "browser"],
    allowedToolsToken: "browser.extract",
  },
] as const;

/** Lookup a tool by id. Returns undefined if not found. */
export function getTool(id: string): ToolDef | undefined {
  return TOOL_CATALOGUE.find((t) => t.id === id);
}

/** A short prompt-friendly description of the catalogue, for the Builder agent. */
export function catalogueForPrompt(): string {
  return TOOL_CATALOGUE.map((t) => {
    return `- \`${t.id}\` (${t.kinds.join("/")}): ${t.description} **When:** ${t.whenToUse}`;
  }).join("\n");
}
