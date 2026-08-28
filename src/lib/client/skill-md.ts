/**
 * skill.md — Echo's portable agent-skill format.
 *
 * Format follows the operational agent-skill spec (procedure, rules,
 * output schema, validation, error handling) rather than a run
 * report. A skill.md generated here is a self-contained
 * specification that another agent (or a human) can read and
 * re-execute the workflow from. The format is intentionally
 * readable as plain markdown — any text editor works.
 *
 * Two emission modes:
 *
 *   1) generateSkillMd(run, agent)
 *      A single skill.md that captures the whole workflow. Use this
 *      when the run is a single coherent task.
 *
 *   2) generateSubtaskSkillMd(run, agent, subtask, idx)
 *      One skill.md per plan subtask. The plan's "triggers" become
 *      each skill's "When to use" / "Do not use" sections; the
 *      actual browser actions the run took (filtered by relevance
 *      to the subtask) become that skill's "Procedure". Use this
 *      to compose multiple skills into a chain — e.g. Hacker News
 *      Searcher → Content Filter → Link Bookmarker, each in its
 *      own folder with a skill.md + examples/ subfolder.
 *
 * The browser actions log is the source of truth for what
 * actually happened. "real: true" actions are surfaced as the
 * primary procedure steps; "real: false" (simulated) ones are
 * summarised as plan-vs-actual notes so the file is honest about
 * what the agent was able to verify vs what it inferred.
 */

import type { AgentRecord, RunRecord } from "./stores";

interface BrowserAction {
  ts: string;
  kind: "navigate" | "click" | "type" | "extract" | "save" | "think";
  url?: string;
  label: string;
  detail?: string;
  screenshot?: string;
  elapsedMs?: number;
  real?: boolean;
}

interface SubTask {
  num: number;
  title: string;
  matchedSkill: string;
  parallel: boolean;
  estTime: string;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Build a URL-friendly slug from a free-form string. Used for
 * the skill's "name" / "id" in the frontmatter.
 */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Capitalise the first letter of each space-separated word in a
 * string. Used to derive a "Skill Name" from the goal text.
 */
function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ""))
    .join(" ")
    .slice(0, 80);
}

/**
 * Pull keyword "triggers" out of a free-form goal. The set is
 * intentionally tiny — these become the "Use this skill when…"
 * bullets.
 */
function extractTriggers(goal: string): string[] {
  const lower = goal.toLowerCase();
  const map: Array<[RegExp, string]> = [
    [/\bhubspot\b/, "HubSpot is mentioned"],
    [/\blead|\bleads\b/, "the user mentions leads"],
    [/\blinkedin\b/, "LinkedIn is mentioned"],
    [/\benrich\b/, "the user wants to enrich records"],
    [/\bgmail|\bemail|\boutreach|\bdraft\b/, "the user wants to draft emails"],
    [/\bslack\b/, "Slack is mentioned"],
    [/\bstripe|\bpayment|\bbilling|\bsubscription\b/, "Stripe or billing is mentioned"],
    [/\bnotion|\bdoc|\bwiki|\bpage\b/, "Notion or docs is mentioned"],
    [/\bsheet|\bspreadsheet|\bexcel\b/, "a spreadsheet is the target"],
    [/\bhacker\s*news|\bhn\.|\bycombinator\b/, "Hacker News is the target"],
    [/\bgoogle\b/, "Google is the target"],
  ];
  const triggers = new Set<string>();
  for (const [re, desc] of map) {
    if (re.test(lower)) triggers.add(desc);
  }
  // Always include a generic "the user runs an Echo agent with
  // this goal" trigger so a downstream agent has a non-empty
  // "when to use" list even when the goal has no recognisable
  // service keywords.
  if (triggers.size === 0) {
    triggers.add("the user dispatches an Echo agent with this goal");
  }
  return Array.from(triggers);
}

function extractAntiTriggers(goal: string): string[] {
  const lower = goal.toLowerCase();
  const anti: string[] = [];
  if (/\bhubspot\b/.test(lower)) anti.push("the user only wants to read HubSpot data offline (use the HubSpot API directly instead)");
  if (/\bgmail|\bemail\b/.test(lower)) anti.push("the user is offline / has no internet (the headless browser needs a network)");
  if (/\bsearch\b/.test(lower)) anti.push("the user needs sub-second results (this skill drives a real browser, expect 3-10s per step)");
  if (anti.length === 0) {
    anti.push("the user has no service-account credentials for the target site (the browser will hit auth walls)");
    anti.push("the task is read-only against a system that exposes a real API (call the API directly instead)");
  }
  return anti;
}

/**
 * Extract a list of input shapes from the run's input array. Each
 * input becomes a row in the "Inputs" table; the first 1-3 are
 * used as the "Input Example" JSON.
 */
function extractInputShape(inputs: RunRecord["inputs"]): Array<{
  name: string;
  type: string;
  required: boolean;
  description: string;
  example: unknown;
}> {
  if (!inputs.length) {
    return [
      {
        name: "url",
        type: "string",
        required: true,
        description: "Target URL the skill should visit or operate on",
        example: "https://example.com",
      },
    ];
  }
  // Walk the first input's payload and surface every top-level key
  // as an input. The skill author can refine the descriptions.
  const sample = inputs[0]?.payload as Record<string, unknown> | undefined;
  if (!sample || typeof sample !== "object") {
    return [
      {
        name: "input",
        type: "object",
        required: true,
        description: "Single input payload as supplied to the run",
        example: sample,
      },
    ];
  }
  return Object.entries(sample).map(([k, v]) => ({
    name: k,
    type: valueType(v),
    required: true,
    description: describeInput(k, v),
    example: v,
  }));
}

function valueType(v: unknown): string {
  if (v === null || v === undefined) return "any";
  if (typeof v === "string") return "string";
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  if (Array.isArray(v)) return "array";
  if (typeof v === "object") return "object";
  return typeof v;
}

function describeInput(key: string, _v: unknown): string {
  const map: Record<string, string> = {
    url: "Target URL the skill should visit or operate on",
    query: "Search query string to pass to the target service",
    timeframe: "Time window to scope the action to (e.g. 'past week')",
    limit: "Maximum number of results to return",
    firstName: "Lead's first name",
    lastName: "Lead's last name",
    email: "Lead's email address",
    company: "Lead's company name",
  };
  return map[key] ?? `Value for the \`${key}\` field`;
}

// ---------------------------------------------------------------------------
// Single-skill generator (the headline download)
// ---------------------------------------------------------------------------

/**
 * Generate the single, whole-workflow skill.md for a run.
 */
export function generateSkillMd(
  run: RunRecord,
  agent: AgentRecord | null
): string {
  const actions = (run.actions ?? []) as BrowserAction[];
  const realActions = actions.filter((a) => a.real);
  const navActions = actions.filter((a) => a.kind === "navigate" && a.url);
  const extractActions = actions.filter((a) => a.kind === "extract");
  const hosts = Array.from(
    new Set(
      navActions
        .map((a) => a.url)
        .filter((u): u is string => !!u)
        .map((u) => {
          try {
            return new URL(u).host.replace(/^www\./, "");
          } catch {
            return u;
          }
        })
    )
  );

  const subTasks: SubTask[] = agent?.subtasks ?? [];
  const triggers = extractTriggers(run.goal ?? agent?.goal ?? "");
  const antiTriggers = extractAntiTriggers(run.goal ?? agent?.goal ?? "");
  const inputShape = extractInputShape(run.inputs);
  const exampleInput = run.inputs.slice(0, 1).map((i) => i.payload);
  const inputsDone = run.inputs.filter(
    (i) => (i.payload as { _status?: string } | null)?._status === "done"
  ).length;
  const skillName =
    agent?.name && agent.name !== "Untitled agent"
      ? titleCase(agent.name)
      : titleCase(
          (run.goal ?? "Echo Workflow")
            .split(/[.!?\n]/)[0]
            .replace(/^(get|do|make|find|search|create|build|send|fetch)\s+/i, "")
        );

  // Pick the most informative real action to feature in the
  // procedure (prefer extract with a screenshot, else navigate).
  const featuredReal =
    extractActions.find((a) => a.real && a.screenshot) ??
    navActions.find((a) => a.real) ??
    realActions[0];

  const lines: string[] = [];
  // Frontmatter (YAML) — useful when skill.md is loaded by a tool
  // that parses frontmatter.
  lines.push("---");
  lines.push(`name: ${skillName}`);
  lines.push(
    `description: ${
      run.goal ?? agent?.goal ?? "Auto-generated Echo skill"
    }`
      .replace(/"/g, '\\"')
      .replace(/\n/g, " ")
  );
  lines.push(`source_run: ${run.id}`);
  lines.push(`source_agent: ${agent?.id ?? "n/a"}`);
  lines.push(`status: ${run.status}`);
  lines.push(`real_browser_verified: ${realActions.length > 0}`);
  lines.push(`created: ${new Date().toISOString()}`);
  lines.push("---");
  lines.push("");

  // Title
  lines.push(`# Skill: ${skillName}`);
  lines.push("");

  // Description
  lines.push("## Description");
  lines.push("");
  lines.push(
    run.goal
      ? run.goal.trim()
      : "Auto-generated skill from an Echo agent run."
  );
  lines.push("");
  if (agent?.reasoning) {
    lines.push(`*Plan reasoning:* ${agent.reasoning.trim()}`);
    lines.push("");
  }

  // When to use
  lines.push("## When to Use");
  lines.push("");
  lines.push("Use this skill when:");
  for (const t of triggers) lines.push(`- ${t}`);
  lines.push("");
  lines.push("Do not use this skill when:");
  for (const t of antiTriggers) lines.push(`- ${t}`);
  lines.push("");

  // Inputs
  lines.push("## Inputs");
  lines.push("");
  if (inputShape.length === 0) {
    lines.push("_No inputs required._");
    lines.push("");
  } else {
    lines.push("| Input | Type | Required | Description |");
    lines.push("|---|---|---:|---|");
    for (const inp of inputShape) {
      lines.push(
        `| \`${inp.name}\` | ${inp.type} | ${inp.required ? "Yes" : "No"} | ${inp.description} |`
      );
    }
    lines.push("");
    if (exampleInput.length > 0) {
      lines.push("### Input Example");
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(exampleInput[0], null, 2));
      lines.push("```");
      lines.push("");
    }
  }

  // Procedure
  lines.push("## Procedure");
  lines.push("");
  if (subTasks.length > 0) {
    lines.push(
      "Follow these steps in order. Each step corresponds to one sub-task in the Skill Manager's plan; sub-steps in italics are the actual browser actions the run performed."
    );
    lines.push("");
    subTasks.forEach((st, i) => {
      lines.push(`${i + 1}. **${st.title}**${st.parallel ? " _(parallel)_" : ""}`);
      lines.push(`   - _Skill:_ \`${st.matchedSkill}\``);
      lines.push(`   - _Est time:_ ${st.estTime}`);
      // Show the actual browser actions for this sub-task by
      // matching the action's URL to the subtask's URL keywords.
      const relatedActions = actions.filter((a) => {
        if (a.kind === "think") return false;
        if (!a.url) return false;
        return st.matchedSkill.toLowerCase().includes(
          a.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0].split(".")[0]
        );
      });
      for (const a of relatedActions) {
        const real = a.real ? " ✓" : " (simulated)";
        const detail = a.detail ? ` — _${a.detail}_` : "";
        lines.push(`     - _${a.kind} ${a.label}${real}_${detail}`);
      }
      lines.push("");
    });
  } else {
    // No sub-tasks (e.g. demo seed) — emit the action log as the
    // procedure directly.
    lines.push("Follow these steps in order:");
    lines.push("");
    actions
      .filter((a) => a.kind !== "think")
      .forEach((a, i) => {
        const real = a.real ? " ✓" : " (simulated)";
        const detail = a.detail ? ` — _${a.detail}_` : "";
        lines.push(`${i + 1}. _${a.kind} ${a.label}${real}_${detail}`);
      });
    lines.push("");
  }

  // Output
  lines.push("## Output");
  lines.push("");
  lines.push("Return this shape on success:");
  lines.push("");
  lines.push("```json");
  lines.push(
    JSON.stringify(
      {
        success: true,
        skill: skillName,
        source_run: run.id,
        results: extractActions.slice(0, 5).map((a) => ({
          ts: a.ts,
          kind: a.kind,
          url: a.url,
          extracted: a.detail,
          real: a.real ?? false,
        })),
        meta: {
          inputs: `${inputsDone}/${run.totalInputs}`,
          elapsed_sec: run.durationSec,
          sites: hosts,
          real_browser_verified: realActions.length > 0,
          real_actions: realActions.length,
          simulated_actions: actions.filter((a) => !a.real).length,
        },
      },
      null,
      2
    )
  );
  lines.push("```");
  lines.push("");

  // If we have a featured real screenshot, embed it as evidence
  // that the run actually worked.
  if (featuredReal?.screenshot) {
    const site = featuredReal.url
      ? (() => {
          try {
            return new URL(featuredReal.url!).host.replace(/^www\./, "");
          } catch {
            return featuredReal.url;
          }
        })()
      : "page";
    lines.push("### Visual evidence");
    lines.push("");
    lines.push(
      `The agent captured this from a real headless Chromium at \`${site}\`:`
    );
    lines.push("");
    lines.push(`![${skillName} — captured by the real headless browser](${featuredReal.screenshot})`);
    lines.push("");
  }

  // Rules
  lines.push("## Rules");
  lines.push("");
  lines.push("- Always run the procedure steps in order.");
  lines.push(
    "- Always prefer the real headless browser over simulated actions when a fresh screenshot is needed."
  );
  if (realActions.length === 0) {
    lines.push(
      "- The reference run for this skill used only simulated actions; the procedure above is a plan, not a verified execution. Re-run and capture real screenshots before relying on this skill in production."
    );
  }
  lines.push(
    `- If the target service returns an auth wall, stop after the first screenshot and surface the failure as \`AUTH_REQUIRED\` — do not invent data.`
  );
  lines.push(
    "- If a sub-step times out, mark it as `TIMEOUT` in the result and continue with the next sub-step rather than retrying the whole procedure."
  );
  lines.push(
    "- Never expose credentials, session cookies, or PII in the returned output."
  );
  lines.push("");

  // Error Handling
  lines.push("## Error Handling");
  lines.push("");
  lines.push("If any sub-step fails:");
  lines.push("");
  lines.push("```json");
  lines.push(
    JSON.stringify(
      {
        success: false,
        skill: skillName,
        error: {
          code: "STEP_FAILED",
          message:
            "One or more sub-steps did not complete. Inspect the `failed_steps` list.",
          failed_steps: actions
            .filter((a) => a.detail && /fail|error|timeout/i.test(a.detail))
            .slice(0, 3)
            .map((a) => ({ kind: a.kind, label: a.label, detail: a.detail })),
        },
      },
      null,
      2
    )
  );
  lines.push("```");
  lines.push("");

  // Validation
  lines.push("## Validation");
  lines.push("");
  lines.push("Before returning success:");
  lines.push("");
  lines.push("- [ ] Every step in the procedure has a non-empty result.");
  lines.push("- [ ] At least one result has a real-browser screenshot when expected.");
  if (realActions.length > 0) {
    lines.push(
      `- [ ] \`real_browser_verified\` is true (this run had ${realActions.length} real action(s)).`
    );
  } else {
    lines.push(
      "- [ ] Re-run with a real headless browser if the integration requires verified data."
    );
  }
  lines.push(
    `- [ ] The total time is within the expected budget (\`${agent?.totalEstTime ?? "10m"}\`).`
  );
  lines.push("- [ ] No credentials or PII are returned in the output.");
  lines.push("");

  // Version
  lines.push("## Version");
  lines.push("");
  lines.push(`Version: 1.0.0  `);
  lines.push(
    `Source: Echo run \`${run.id}\` from agent \`${agent?.id ?? "n/a"}\`  `
  );
  lines.push(`Created: ${new Date().toISOString()}  `);
  lines.push(
    realActions.length > 0
      ? `Verified: ${realActions.length} real headless Chromium action(s) in the source run.`
      : "Verified: no real headless actions in the source run — re-run before production use."
  );
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Per-subtask skill.md generator
// ---------------------------------------------------------------------------

/**
 * Build a single skill.md for one sub-task of the plan. The
 * sub-task's URL hosts become the procedure, the matching
 * browser actions become sub-steps, and the inputs are the
 * outputs of the previous sub-task in the chain.
 */
export function generateSubtaskSkillMd(
  run: RunRecord,
  agent: AgentRecord | null,
  subtask: SubTask,
  idx: number,
  totalSubtasks: number,
  prevOutput: Record<string, unknown> | null = null
): string {
  const actions = (run.actions ?? []) as BrowserAction[];
  const realActions = actions.filter((a) => a.real);
  const skillName = titleCase(subtask.matchedSkill.replace(/^NEW:\s*/, ""));
  const skillSlug = slug(skillName);
  const triggers = extractTriggers(subtask.title);
  const antiTriggers = extractAntiTriggers(subtask.title);

  // If we have a previous step's output, that's the input schema
  // for this step. Otherwise use the run's input shape.
  const inputShape = prevOutput
    ? Object.entries(prevOutput).map(([k, v]) => ({
        name: k,
        type: valueType(v),
        required: true,
        description: `Output of the previous step (\`${k}\`)`,
        example: v,
      }))
    : extractInputShape(run.inputs);

  const lines: string[] = [];
  lines.push("---");
  lines.push(`name: ${skillName}`);
  lines.push(`description: ${subtask.title.replace(/"/g, '\\"').replace(/\n/g, " ")}`);
  lines.push(`source_run: ${run.id}`);
  lines.push(`source_agent: ${agent?.id ?? "n/a"}`);
  lines.push(`subtask_index: ${idx + 1} / ${totalSubtasks}`);
  lines.push(`parallel: ${subtask.parallel}`);
  lines.push("---");
  lines.push("");
  lines.push(`# Skill: ${skillName}`);
  lines.push("");
  lines.push("## Description");
  lines.push("");
  lines.push(subtask.title);
  lines.push("");

  lines.push("## Purpose");
  lines.push("");
  lines.push(
    idx === 0
      ? `This is the first step in a chain of ${totalSubtasks} skills dispatched by Echo to satisfy the user's goal.`
      : `Step ${idx + 1} of ${totalSubtasks} in a chained Echo workflow. Receives the previous step's output as input.`
  );
  lines.push("");

  lines.push("## When to Use");
  lines.push("");
  lines.push("Use this skill when:");
  for (const t of triggers) lines.push(`- ${t}`);
  lines.push("");
  lines.push("Do not use this skill when:");
  for (const t of antiTriggers) lines.push(`- ${t}`);
  lines.push("");

  lines.push("## Inputs");
  lines.push("");
  if (inputShape.length === 0) {
    lines.push("_No inputs — this step takes no parameters._");
  } else {
    lines.push("| Input | Type | Required | Description |");
    lines.push("|---|---|---:|---|");
    for (const inp of inputShape) {
      lines.push(
        `| \`${inp.name}\` | ${inp.type} | ${inp.required ? "Yes" : "No"} | ${inp.description} |`
      );
    }
  }
  lines.push("");

  // Procedure — for this sub-task, walk the real actions and
  // surface the ones that hit the URL hosts associated with this
  // sub-task's skill.
  const subTaskHost = extractHost(skillSlug);
  const relatedActions = actions.filter((a) => {
    if (a.kind === "think" && !a.real) return false;
    if (!a.url) return a.kind === "think" && a.real === true;
    try {
      const host = new URL(a.url!).host.replace(/^www\./, "");
      return host.includes(subTaskHost) || subTaskHost.includes(host.split(".")[0]);
    } catch {
      return false;
    }
  });

  lines.push("## Procedure");
  lines.push("");
  if (relatedActions.length === 0) {
    // No matching real actions — emit a procedural recipe based on
    // the matchedSkill keyword so the skill is still usable.
    lines.push(
      `1. Open the public home page of the service named in this skill's title.`
    );
    lines.push(
      `2. Authenticate using the configured service-account credentials.`
    );
    lines.push(
      `3. Perform the action described in the title (\`${subtask.title}\`).`
    );
    lines.push(
      `4. Capture a screenshot of the result and return it with the structured output below.`
    );
  } else {
    relatedActions.forEach((a, i) => {
      const real = a.real ? " ✓" : " (simulated)";
      const detail = a.detail ? ` — _${a.detail}_` : "";
      lines.push(`${i + 1}. _${a.kind} ${a.label}${real}_${detail}`);
    });
  }
  lines.push("");

  // Output
  lines.push("## Output");
  lines.push("");
  lines.push("Return this shape on success:");
  lines.push("");
  lines.push("```json");
  lines.push(
    JSON.stringify(
      {
        success: true,
        skill: skillName,
        subtask_index: idx + 1,
        // The "next_step" key is what the planner reads to chain
        // skills — it must point at the next sub-task's skill name.
        next_step: idx + 1 < totalSubtasks ? `step_${idx + 2}` : null,
        results: relatedActions
          .filter((a) => a.kind === "extract" || a.kind === "save")
          .slice(0, 5)
          .map((a) => ({
            kind: a.kind,
            label: a.label,
            extracted: a.detail,
            real: a.real ?? false,
          })),
      },
      null,
      2
    )
  );
  lines.push("```");
  lines.push("");

  // Embed the most informative real screenshot if any.
  const featured = relatedActions.find((a) => a.real && a.screenshot);
  if (featured?.screenshot) {
    const site = featured.url ? (() => {
      try { return new URL(featured.url!).host.replace(/^www\./, ""); }
      catch { return featured.url; }
    })() : "page";
    lines.push("### Visual evidence");
    lines.push("");
    lines.push(`![${skillName} — captured by the real headless browser at ${site}](${featured.screenshot})`);
    lines.push("");
  }

  // Rules
  lines.push("## Rules");
  lines.push("");
  lines.push(`- Always perform the ${relatedActions.length || 3} procedure step(s) in order.`);
  lines.push("- Capture a real screenshot before returning success.");
  lines.push("- Do not fabricate data; surface failures as `STEP_FAILED`.");
  lines.push("- Never include credentials, session cookies, or PII in the output.");
  lines.push("");

  // Error handling
  lines.push("## Error Handling");
  lines.push("");
  lines.push("If the procedure can't complete:");
  lines.push("");
  lines.push("```json");
  lines.push(
    JSON.stringify(
      {
        success: false,
        skill: skillName,
        subtask_index: idx + 1,
        error: {
          code: "STEP_FAILED",
          message: "This sub-step could not complete. See the run trace for details.",
        },
      },
      null,
      2
    )
  );
  lines.push("```");
  lines.push("");

  // Validation
  lines.push("## Validation");
  lines.push("");
  lines.push("- [ ] Procedure steps completed in order.");
  lines.push("- [ ] At least one real-browser screenshot captured (if the service is reachable).");
  lines.push("- [ ] Output schema matches the `## Output` section above.");
  lines.push("- [ ] `next_step` correctly points at the next sub-task in the chain.");
  lines.push("");

  // Version
  lines.push("## Version");
  lines.push("");
  lines.push(`Version: 1.0.0  `);
  lines.push(`Source: Echo run \`${run.id}\` · subtask ${idx + 1}/${totalSubtasks}  `);
  lines.push(`Created: ${new Date().toISOString()}`);
  lines.push("");

  return lines.join("\n");
}

function extractHost(slug: string): string {
  // "hacker-news-searcher" -> "hacker-news-searcher" (used as
  // substring when matching the URL host).
  return slug;
}

// ---------------------------------------------------------------------------
// Browser-side download
// ---------------------------------------------------------------------------

/**
 * Trigger a browser download of the skill.md file. Pure browser
 * API — no server roundtrip. The file is named after the run so
 * multiple downloads don't collide.
 */
export function downloadSkillMd(
  run: RunRecord,
  agent: AgentRecord | null,
  options: { author?: string } = {}
): void {
  if (typeof window === "undefined") return;
  const content = generateSkillMd(run, agent);
  triggerDownload(content, fileName(run, agent, ""));
}

/**
 * Trigger a download of the per-subtask skill pack. Builds a
 * manifest in addition to one skill.md per subtask and triggers
 * a sequence of downloads (one per file) — most browsers will
 * queue these. Returns the list of generated file names for
 * debugging.
 */
export function downloadSkillPack(
  run: RunRecord,
  agent: AgentRecord | null
): string[] {
  if (typeof window === "undefined") return [];
  const subtasks: SubTask[] = agent?.subtasks ?? [];
  if (subtasks.length === 0) {
    // Fall back to the single-skill download.
    downloadSkillMd(run, agent);
    return ["single-skill.md"];
  }
  const generated: string[] = [];
  // Chain: the previous step's output is just the list of results
  // from the prior skill. We don't have rich inter-step data on
  // hand here, so we pass an empty stub for all but the first
  // step. A future iteration could derive this from the action
  // log.
  const prevOutput: Record<string, unknown> | null = null;
  subtasks.forEach((st, i) => {
    const content = generateSubtaskSkillMd(
      run,
      agent,
      st,
      i,
      subtasks.length,
      i === 0 ? null : prevOutput
    );
    const name = fileName(run, agent, `-${i + 1}-${slug(st.matchedSkill)}`);
    triggerDownload(content, name);
    generated.push(name);
  });
  // Also include a top-level manifest the user can keep with the
  // folder of skill.md files.
  const manifest = generatePackManifest(run, agent, subtasks);
  triggerDownload(manifest, fileName(run, agent, "-manifest"));
  generated.push(fileName(run, agent, "-manifest.md"));
  return generated;
}

function generatePackManifest(
  run: RunRecord,
  agent: AgentRecord | null,
  subtasks: SubTask[]
): string {
  const lines: string[] = [];
  lines.push("# Skill pack manifest");
  lines.push("");
  lines.push(
    `Generated from Echo run \`${run.id}\` and agent \`${agent?.id ?? "n/a"}\`.`
  );
  lines.push("");
  lines.push("This pack contains one skill.md per sub-task of the plan, in execution order. The agent runs them in sequence; each skill's `next_step` in its `## Output` section points at the next skill's filename.");
  lines.push("");
  lines.push("## Skills in this pack");
  lines.push("");
  subtasks.forEach((st, i) => {
    lines.push(
      `${i + 1}. **${titleCase(st.matchedSkill.replace(/^NEW:\s*/, ""))}** — _${st.title}_`
    );
  });
  lines.push("");
  lines.push("## Folder layout");
  lines.push("");
  lines.push("```text");
  lines.push("skills/");
  for (const st of subtasks) {
    const slugName = slug(st.matchedSkill.replace(/^NEW:\s*/, ""));
    lines.push(`├── ${slugName}/`);
    lines.push(`│   ├── skill.md`);
    lines.push(`│   └── examples/`);
  }
  lines.push("└── manifest.md");
  lines.push("```");
  lines.push("");
  lines.push("## Composition");
  lines.push("");
  lines.push("Read `manifest.md` → load each `skill.md` in order → for each, run the procedure and return the output → the next skill's input is the previous skill's output.");
  lines.push("");
  return lines.join("\n");
}

function fileName(
  run: RunRecord,
  agent: AgentRecord | null,
  suffix: string
): string {
  const base = (agent?.name ?? run.id)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "echo-skill";
  return `${base}${suffix}-${run.id.slice(-12)}.md`;
}

function triggerDownload(content: string, filename: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
