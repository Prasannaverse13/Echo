# WebMCP Integration — Echo for the WebMCP Challenge

> Submission: **Echo** — show it once, run it forever.
> Hackathon: [WebMCP Challenge](https://webmcp.devpost.com/) (OpenAI, deadline
> Sept 3 2026 1:00 PM PT / Sept 4 1:30 AM GMT+5:30)
> Built on: Next.js 16 + React 19 + TypeScript, deployed on Vercel.

## What we ship

**29 WebMCP tools** registered through `document.modelContext.registerTool()`,
the spec-correct imperative API, feature-detected and gracefully no-oping
when the browser doesn't expose `modelContext`.

| Page | Tools | Mounted in |
| --- | --- | --- |
| Global (every page) | `navigate_echo`, `get_echo_status`, `show_toast`, `wait`, `echo_ping` (5) | `AppShell` |
| `/compose` | `preview_echo_plan`, `compose_echo_agent`, `set_composer_goal`, `start_planning`, `dispatch_current_plan`, `get_composer_state` (6) | compose page |
| `/runs` | `list_runs`, `get_run`, `get_run_stats`, `find_runs_by_goal`, `cancel_run` (5) | runs page |
| `/agents` | `list_agents`, `get_agent`, `dispatch_saved_agent`, `archive_agent`, `delete_agent`, `get_agents_overview` (6) | agents page |
| `/skills` & `/record` | `list_skills`, `get_skill`, `find_skills_by_name`, `get_skill_md`, `create_skill_from_text`, `dispatch_saved_skill`, `delete_skill` (7) | skills page (also record page) |

A live status pill (`WebMCP · N tools`) in the topbar lets users see how
many tools are currently registered, and opens a popover with the tool
list + links to the Inspector extension and the Chrome docs.

## Headline tools for the demo

Three tools tell the WebMCP story best:

1. **`get_skill_md`** — given a saved skill id, returns the portable
   `SKILL.md` text (YAML frontmatter + parameterized body with
   `{{token}}` placeholders + rules + error codes). An agent can read
   it, paste it into another runtime, or hand it to the user.
2. **`dispatch_saved_skill`** — given a skill id + a goal, fires the
   saved skill as an autonomous run. The "use this skill to do X" tool.
3. **`compose_echo_agent`** — given a plain-English goal, returns a
   step-by-step plan (`subtasks[]`, `totalEstTime`, `reasoning`) without
   dispatching. Lets the agent show the user what it's about to do
   before committing.

All three call the same Next.js API routes the buttons call
(`/api/agents/run-autonomous`, `/api/agents/compose`, `/api/skills/save`),
so agent-driven behavior is identical to the manual flow.

## Resource-link review (every link in `/resources`)

### Documentation
- **`webmachinelearning/webmcp` on GitHub** — Spec source, explainers,
  open issues. Echo's `use-webmcp.ts` hook mirrors the `registerTool`
  call shape 1:1.
- **WebMCP developer documentation** — Confirmed the imperative API
  lives on `document.modelContext` (not the deprecated
  `navigator.modelContext`). Confirmed JSON Schema inputs and
  `{ content: [{ type: "text", text }] }` result envelope. Echo's
  `types.ts` mirrors both.
- **WebMCP origin trial** — Confirmed the Chrome 149+ origin trial.
  Echo is also reachable on ChatGPT's in-app browser (per the challenge
  starter guidance).
- **WebMCP tool security guide** — Echo sets `readOnlyHint: true` on
  every read tool and `readOnlyHint: false` on every mutating tool.
  Annotations respected per the guide.

### OpenAI
- **WebMCP Showcase** — Reference list. Echo's "use a skill to do X"
  flow is the closest pattern to the showcase's agent-native apps.
- **ChatGPT Sites** — OpenAI's hosting path. Echo is hosted on Vercel
  (equivalent free tier) but is functionally openable in ChatGPT's
  in-app browser for the WebMCP origin trial.

### Cloudflare
- **WebMCP overview** — Confirmed Cloudflare's framing matches Echo's
  "structured tools for in-browser agents" model.
- **WebMCP on Browser Run** — Cloudflare's managed headless. Echo
  ships its own headless (real Playwright) on Vercel + Cloud Run, and
  exposes a parallel `browser_run` step kind. Future option: route
  through Browser Run instead.
- **Coffee-store demo** — Reference implementation. Echo's
  `compose_echo_agent` is the closest analog: a tool that takes
  natural language and dispatches a real workflow.
- **Cloudflare challenge landing page** — Skimmed; Cloudflare's $5k
  bonus track is for Coffee-store-style commerce. Echo doesn't fit
  that track but the WebMCP pattern is the same.
- **WebMCP on Workers template** — React + Workers starter. Echo's
  Vite-less Next.js app is more production-shaped, but the
  `useWebMCPTool` hook pattern is the inspiration for Echo's
  `useWebMCPTools`.
- **Cloudflare Pages / Workers** — Hosting alternative. Echo is on
  Vercel; Cloudflare is a fine swap.

### Vercel
- **Storefront source code** — Skimmed. The "WebMCP implementation"
  link is more relevant for Echo (see below).
- **WebMCP implementation** — This is the canonical reference for
  "WebMCP in an existing Next.js app." Echo's `useWebMCPTools` uses
  the same React-hook pattern with the same body-lookup-via-ref-map
  trick to avoid stale closures.
- **Live storefront demo** — Commerce example; doesn't overlap with
  Echo's domain.
- **Vercel pricing** — Free Hobby tier covers Echo's deployment (the
  `maxDuration=60` LLM routes are within budget).

### Shopify
- **Shopify WebMCP tools documentation** — Skimmed; Shopify's pattern
  is "expose Catalog API as a tool." Echo's tool catalogue is similar
  in spirit (gmail_draft, sheets_*, drive_*, slack_post, etc.) and
  could route through Shopify's Catalog for commerce skills.
- **Agentic tools** — General agent-tool design notes; matches Echo's
  tool-catalogue philosophy.

### Google Chrome
- **useWebMCPTool React hook** — Echo's `useWebMCPTools` (plural)
  follows the same shape. Body-lookup-via-ref-map is the same trick
  used here.
- **WebMCP Explainer** — The API design spec. Echo matches it
  (imperative API, JSON Schema, content envelope).
- **WebMCP with Angular** — Skimmed. Not applicable (Echo is React).
- **WebMCP evals** — Echo's own eval harness
  (`src/lib/recorder/evals/`) covers the SKILL.md output side. The
  WebMCP evals target is closer to the Model Context Tool Inspector
  extension (manual / Gemini-3-flash evaluation). For the live demo
  we plan to validate with the Inspector.
- **WebMCP developer documentation** — Same as the docs link above.
- **Debug WebMCP tools** — Confirmed: Echo's `webmcp-badge.tsx` calls
  `document.modelContext.getTools()` to show a live count, and the
  Inspector extension can be used to manually call any of Echo's
  29 tools.
- **Modern Web Guidance** — "Use the WebMCP skill when building with
  coding agents." Echo itself is exactly the kind of agent-native
  product this guidance targets.
- **WebMCP demos** — Skimmed. The zaMaker (imperative) and Travel
  demo (React, imperative) demos confirm Echo's pattern. Le Petit
  Bistro (declarative) is the HTML-form-annotation API, which Echo
  doesn't use — Echo registers JS tools only.

### Render
- **Render Workflows** — Render's productized background-worker
  primitive. Echo's worker is a Cloud Run service (Pub/Sub-driven
  ADK agent runner per `DEPLOY.md`); could port to Render Workflows.
- **Workflows documentation** — Same as above.
- **Starter templates** — Skimmed.
- **Participant credits** — $50 in Render credits. Logged for the
  user; not auto-claimed.
- **Credits documentation** — Reference for the credits above.

### Netlify
- **Netlify** — Hosting alternative. Echo is on Vercel.
- **Participant credits** — 3,000 Netlify credits. Logged for the
  user.
- **Choose your path** — Skimmed.
- **WebMCP starter** — "Copy a prompt and use an agent to build and
  deploy a full site on Netlify with Agent Runners." Echo is already
  on Vercel; the WebMCP starter's prompt template is a useful
  reference for future WebMCP-from-scratch projects.

## What we didn't change

- **No new dependencies.** WebMCP is a browser-native API
  (`document.modelContext`); Echo's hook is pure TypeScript.
- **No backend changes.** The existing `/api/agents/*` and
  `/api/skills/*` routes already serve both the buttons and the
  tools.
- **No new LLM calls.** All 7 skills tools reuse existing endpoints
  plus the existing `generateSkillFromRecordSmart` helper.

## How to demo

1. Open Chrome 149+ (or with `chrome://flags/#enable-webmcp-testing`).
2. Install the
   [Model Context Tool Inspector](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapenggkahomfgkhfehlcenpd).
3. Visit `https://echo-one-liard.vercel.app/skills` and sign in
   (test user `test-call@yalixa.store` / `Test1234!`).
4. The topbar pill shows `WebMCP · 12 tools` (5 global + 7 skills).
5. In the Inspector, call:
   - `list_skills` → see saved + demo skills
   - `find_skills_by_name({ query: "Lead" })` → find the LinkedIn Lead
     Enricher
   - `get_skill_md({ skillId: "..." })` → see the portable SKILL.md
   - `dispatch_saved_skill({ skillId: "...", goal: "Process the new
     HubSpot leads", inputCount: 3 })` → see a real run start

For the multi-page demo, navigate to `/compose` (tools go from 12 to
18) or `/agents` (18 to 24).
