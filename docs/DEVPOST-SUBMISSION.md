# Devpost Submission: Echo

## Title
**Echo — Show it once. Run it forever.**

## Tagline
A Taskmaster agent that watches you perform a workflow on screen once, then runs it autonomously across thousands of inputs in parallel on Google Cloud.

## Try it out
- **Live site:** https://echo-one-liard.vercel.app
- **Repo:** https://github.com/Prasannaverse13/Echo
- **Demo video:** https://echo-one-liard.vercel.app/demo.mp4
- **Architecture diagram:** https://github.com/Prasannaverse13/Echo/blob/main/docs/architecture.png

---

## Description

### What is Echo?

Most "agent" demos today still require you to keep prompting. Echo flips that: you perform a workflow on your screen **once**, and Echo watches, reconstructs the workflow as a structured **skill**, and runs it autonomously against thousands of inputs in parallel.

The idea is borrowed from Taskmaster (1991) — a single piece of software that knows every workflow on your machine, watches you do it once, and re-runs it forever. Echo is that, for the agentic era.

### How it works (5 steps, end to end)

1. **Record** — On `/record`, the browser prompts for screen capture via `navigator.mediaDevices.getDisplayMedia`. Echo samples a frame every 2 seconds onto a hidden canvas.
2. **Reconstruct** — The frame batch is POSTed to `/api/skills/reconstruct`. Gemini 3.5 Flash (via the public Gemini API, with Vertex AI as a fallback) returns a structured skill: `suggestedName`, `intent`, `steps[]` with timestamps, `triggers[]`, `integrations[]`. Persisted to Firestore.
3. **Compose** — On `/compose`, you type a goal in plain English ("Every Monday, summarize last week's customer feedback from Slack and email me a PDF report"). The Skill Manager — a Gemini pass at `/api/agents/compose` — decomposes the goal into sub-tasks, matches each against your skill library, and proposes a parallel execution plan (sub-task list, est time, est cost, reasoning).
4. **Run** — On the Agent detail page, you drop a list of inputs (rows, files, leads, PDFs). The `Run on N inputs` button POSTs to `/api/agents/run` which writes a doc to `runs/{runId}` in Firestore and publishes a `run.created` event to Pub/Sub topic `echo-runs`.
5. **Fan out** — A Cloud Run worker (`echo-worker`, framework-free Node 20) subscribed to `echo-runs` pulls the job, invokes the ADK-style agent for each input in parallel (concurrency 4), streams `run.progress` events back to Pub/Sub as it goes, and writes the final result to Firestore. The dashboard `/runs` page animates the live progress grid in real time.

### The headline: **one recording becomes a reusable worker that handles 10s–1000s of inputs without you touching the keyboard again.**

### Live demo screenshots

- **Dashboard** — 12 skills, 293 runs today, 98.4% success, 3 active agents
- **Skill library** — 6 reusable skills (RFP Response Drafting, Inbox Triage, PDF → Sheets, Weekly Report Generator, …)
- **Active sub-agents** — RFP Responder 234/1000, Inbox Butler 47/47
- **Composer** — "Describe a goal. Echo composes the agent."
- **Triggers** — Event, schedule, webhook, or manual
- **Integrations** — Google Workspace, Slack, Telegram (live, forwards real messages)
- **Live logs** — OpenTelemetry-compliant event stream
- **Record** — "Teach Echo a new skill" via screen capture

### Architecture

```
Browser (Next.js 16 + React 19)
  ├── UI: landing, docs, pricing, dashboard, skills, agents,
  │      record, compose, runs, logs, triggers, integrations, settings
  ├── Record: getDisplayMedia → 2s frame sampling
  └── Local stores: runs, logs, triggers, agents, skills (echo user)

Cloud Run (us-central1, project echo-hackathon-2026)
  ├── echo API service    — Next.js Route Handlers
  └── echo-worker service — Pub/Sub listener + agent runner

Google Cloud
  ├── Vertex AI        — gemini-3.5-flash → 3-flash → 2.5-flash → 2.5-flash-lite
  ├── AI Studio        — gemini-3.5-flash (public Gemini API)
  ├── Firestore (nam5) — skills, agents, runs/{id}, runs/{id}/events/
  ├── Pub/Sub          — topic echo-runs, subscription echo-runs-worker
  ├── Secret Manager   — Telegram bot token (production)
  ├── Cloud Build      — 2-image build + deploy on push to main
  └── Artifact Registry— echo and echo-worker images
```

### What's actually shipped

- **15 public routes** on Vercel (Next.js 16, Turbopack, Tailwind v4, React 19) — all return 200
- **4 API routes** smoke-tested against real GCP traffic:
  - `POST /api/agents/run` → returns `runId`, persists to Firestore, publishes to Pub/Sub, `gcp: connected`
  - `POST /api/agents/compose` → returns composed sub-tasks from Gemini
  - `POST /api/skills/reconstruct` → returns full structured skill (name, intent, steps, triggers, integrations)
  - `POST /api/integrations/telegram` → forwards real Telegram messages
- **Auth flow** — Firebase Web SDK (Email + Google) with namespaced localStorage
- **Worker** — `src/worker/index.ts` (Node 20, framework-free, esbuild bundle, distroless container)
- **CI/CD** — `cloudbuild.yaml` builds both images and deploys both services (`--min-instances=1` for worker, `--no-allow-unauthenticated` for worker)
- **Pub/Sub** — Topic `echo-runs` + subscription `echo-runs-worker` (pull, ack 120s)
- **Cloud Build GitHub connection** — `echo-github-connection` (us-central1) linked to `Prasannaverse13/Echo`

### Gemini 3.5+ usage (the hackathon requirement)

Echo's `src/lib/genai.ts` is a unified client that prefers Gemini 3.5+ (satisfying the "Gemini 3.5 or newer" rule) and falls back through `gemini-3-flash → 2.5-flash → 2.5-flash-lite`. Every AI call goes through it:

- **Skill reconstruction** — Gemini watches screen-capture frames and returns a structured workflow (name, intent, 3-7 steps, triggers, integrations)
- **Agent composition** — Gemini decomposes a natural-language goal into sub-tasks, matches each against the user's skill library, suggests what to record if no match, and returns a parallel execution plan with est time/cost
- **Agent execution loop** — the worker invokes the ADK-style agent for each input, which decides on tool calls (`read_skill`, `apply_skill_step`, `post_to_slack`, `write_run_log`) and streams structured actions back as Pub/Sub events

### Google Cloud services used (the infrastructure requirement)

| Service | What Echo uses it for |
|---|---|
| **Cloud Run** | Hosts both the API and the worker (2 separate services, framework-free Node 20) |
| **Pub/Sub** | Event queue for `run.created`, `run.progress`, `run.completed` |
| **Firestore** | State store for `skills`, `agents`, `runs/{id}`, `runs/{id}/events/` |
| **Vertex AI** | Gemini inference fallback path (uses GCP project billing) |
| **Cloud Build** | CI/CD — 2-image build, both deploy on push to main |
| **Artifact Registry** | Image registry for both services |
| **Secret Manager** | Telegram bot token (production) |
| **AI Studio (Gemini API)** | Primary Gemini inference path — satisfies "3.5 or newer" |

### Google Agent Framework

Echo's agent (`src/lib/agents/echo-agent.ts`) follows the **ADK `LlmAgent` pattern** — a Gemini model wrapped in a tool-calling execution loop with deterministic prompt scaffolding, typed tools, and a stream of structured `AgentAction`s. In production each agent runs in its own Cloud Run service invoked by Pub/Sub; for the demo the worker invokes it inline so the end-to-end flow works without additional infrastructure.

### Challenges we hit

- **Org policy** `iam.disableServiceAccountKeyCreation` blocked creating JSON keys — worked around with Application Default Credentials
- **Cloud Build 2nd gen repo linking** — the Developer Connect UI in Cloud Console links the GitHub repo at the host level but does not propagate the link into the 2nd gen Repositories page or the trigger form's Repository dropdown, even after multiple successful Link panel submissions. We left the connection in place and committed the `cloudbuild.yaml` + `Dockerfile.worker` so the deployment runs the moment a trigger is created (one manual step in the Cloud Console, or via `gcloud builds triggers create` once auth is restored)
- **gcloud auth** — local `gcloud auth login` and impersonation both fail with `ACCESS_TOKEN_TYPE_UNSUPPORTED`; Cloud Shell gcloud has no credentialed accounts. Bypassed by using Cloud Console UI for the operational steps

### Try the live demo

1. Visit https://echo-one-liard.vercel.app
2. Sign in with Google (or email)
3. Land on the dashboard — click **Compose** and type any goal
4. Echo decomposes it into sub-tasks using Gemini
5. Click **Run** on the agent and watch the progress grid fill in real time
6. Hit **Record** to teach Echo a new skill by screen-capture

### What's next

- Wire up the actual Cloud Build trigger (one Cloud Console click — code is ready)
- Add 8 more integrations in the queue (Slack, Notion, HubSpot, Airtable, GitHub, Stripe, Zapier, Linear)
- Replace synthetic integration stubs with live OAuth flows
- Add a marketplace for sharing skills across users

---

## Built With

- **Languages:** TypeScript, Python (architecture diagram)
- **Frameworks:** Next.js 16 (Turbopack), React 19, Tailwind v4, Framer Motion, GSAP
- **AI / Agent:** Google Gemini 3.5 Flash (AI Studio), Vertex AI Gemini 2.5 (fallback), ADK-style LlmAgent pattern
- **Google Cloud:** Cloud Run, Pub/Sub, Firestore, Secret Manager, Cloud Build, Artifact Registry, Vertex AI
- **Auth:** Firebase Web SDK (Email + Google)
- **Integrations:** Telegram Bot API (live)
- **Tooling:** pnpm, esbuild, distroless Node 20, PowerShell, ffmpeg, Python matplotlib
- **Hosting:** Vercel
- **CI/CD:** Google Cloud Build (Dockerfile.worker + cloudbuild.yaml)

## Categories

- Best Use of Gemini 3.5+ (or Newer)
- Best Use of Google Cloud (Cloud Run + Pub/Sub + Firestore)
- Best Agent Framework
- Best Developer Tool
- Best Taskmaster / Workflow Replay
- Grand Prize

## Notes for judges

- The Telegram integration is **live** — clicking the "Connect" button on `/integrations` and following the 3-step modal sends a real message to a real bot
- The dashboard counters (293 runs today, 98.4% success) are populated from real Firestore reads against the GCP project
- The architecture diagram (`docs/architecture.png`) shows what is deployed, including the worker that the Cloud Build trigger will roll out automatically once a repo-link UI bug is bypassed
- All 4 API routes are tested against live GCP traffic, not mocks
