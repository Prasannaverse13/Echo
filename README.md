# Echo

> A **Taskmaster** agent that watches you do a workflow once via screen capture, then replays it autonomously across many inputs.

Built for the **All Things Agentic Hackathon** (Sep 1, 2026, $180k prize pool).

---

## What it does

1. **Record** — you click *Record* and do the workflow on your screen once. Echo captures your tab via `getDisplayMedia` (browser-native, no Electron).
2. **Reconstruct** — Gemini 3.5 Flash turns the captured frames into a structured *skill* (steps, triggers, integrations).
3. **Compose** — type a goal in plain English; Echo's Skill Manager breaks it into sub-tasks, matches each against your library, and proposes a parallel execution plan.
4. **Run** — drop a list of inputs (rows, files, leads, PDFs); Echo fans them out to sub-agents, each running the matched skill, streaming progress and results back to the dashboard.

The headline: a single recording becomes a reusable worker that handles 10s–1000s of inputs without you touching the keyboard again.

---

## Hackathon tech checklist

| Requirement | Echo |
|---|---|
| Gemini 2.5+ (Flash) | `gemini-2.5-flash` via `@google/genai` for the API routes, `gemini-2.5-flash` via `@google-cloud/vertexai` inside the ADK agent |
| Google ADK / GenAI / Antigravity / GenKit | Google ADK-style `LlmAgent` in `src/lib/agents/echo-agent.ts` (Gemini + tool-calling loop), uses `@google/genai` for HTTP routes and `@google-cloud/vertexai` for the agent |
| ≥ 1 Google Cloud infra service | **4** wired: Cloud Firestore (`skills`/`agents`/`runs` collections), Cloud Pub/Sub (`echo-runs` topic), Vertex AI (ADK agent), Cloud Run (multi-stage Dockerfile + `cloudbuild.yaml`) |
| Working webapp | Next.js 16 (App Router) + React 19 + Tailwind v4 — 17 pages, real screen capture, real API routes, all 200 OK |
| Architecture diagram | See `docs/architecture.md` (Mermaid) |
| 4-min demo video | See `docs/demo-script.md` |
| README with setup | This file |

---

## Quick start

```bash
# Install
pnpm install

# Copy environment template
cp .env.local.example .env.local

# Run dev server (Turbopack)
pnpm dev
# → http://localhost:3000
```

The app **works out of the box** with mock fallbacks. Add a `GEMINI_API_KEY` to `.env.local` to use real Gemini for skill reconstruction and composition. Set `GCP_ENABLED=true` to write runs/skills/agents to Firestore and publish run events to Pub/Sub.

---

## Local development with real GCP

Echo uses **Application Default Credentials (ADC)** — no JSON service-account key file is required, and the `iam.disableServiceAccountKeyCreation` org policy that the yalixa.store workspace enforces does not block us.

```bash
# 1. Install Google Cloud SDK
#    https://cloud.google.com/sdk/docs/install

# 2. Authenticate once
gcloud auth application-default login

# 3. Point at the hackathon project
gcloud config set project echo-hackathon-2026

# 4. In .env.local, set:
#    GCP_ENABLED=true
#    GCP_PROJECT_ID=echo-hackathon-2026

# 5. (Optional) Add a real Gemini key
#    GEMINI_API_KEY=...

pnpm dev
```

That's it. The `@google-cloud/*` SDKs pick up the ADC token automatically. Skills, agents, and run events now persist to Firestore and Pub/Sub in real time.

### Vercel deploy (serverless)

```bash
# 1. Push to GitHub, import in Vercel

# 2. In the Vercel project settings, add these env vars:
#    GCP_ENABLED=true
#    GCP_PROJECT_ID=echo-hackathon-2026
#    GCP_VERTEX_LOCATION=us-central1
#    GCP_PUBSUB_TOPIC=echo-runs
#    GEMINI_API_KEY=<your Gemini key>
#
# 3. To use a service-account JSON for Firestore/Pub/Sub from Vercel,
#    paste the full JSON into GOOGLE_APPLICATION_CREDENTIALS_JSON.
#    The app writes it to a temp file at boot and points ADC at it.
```

### Cloud Run deploy (production)

```bash
# 1. Create Artifact Registry repo (one-time)
gcloud artifacts repositories create echo \
  --project=echo-hackathon-2026 \
  --location=us-central1 \
  --repository-format=docker

# 2. Grant Cloud Build's default SA permission to deploy
gcloud projects add-iam-policy-binding echo-hackathon-2026 \
  --member=serviceAccount:$(gcloud projects describe echo-hackathon-2026 --format='value(projectNumber)')@cloudbuild.gserviceaccount.com \
  --role=roles/run.admin

gcloud projects add-iam-policy-binding echo-hackathon-2026 \
  --member=serviceAccount:$(gcloud projects describe echo-hackathon-2026 --format='value(projectNumber)')@cloudbuild.gserviceaccount.com \
  --role=roles/iam.serviceAccountUser

# 3. Store Gemini key in Secret Manager
echo -n "$GEMINI_API_KEY" | gcloud secrets create gemini-key \
  --project=echo-hackathon-2026 --data-file=-

# 4. Connect repo and create trigger (Cloud Build → Cloud Run)
#    Point at this Dockerfile + cloudbuild.yaml
```

The runtime service account is the default Cloud Run compute SA — it already has `roles/aiplatform.user` (granted at project creation) for Vertex AI calls. Add `roles/datastore.user` for Firestore and `roles/pubsub.publisher` for Pub/Sub if your project's auto-grants don't cover them.

---

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── skills/reconstruct/route.ts   # POST — Gemini vision → skill JSON + Firestore
│   │   ├── agents/compose/route.ts       # POST — Skill Manager (decompose goal)
│   │   └── agents/run/route.ts           # POST/GET — enqueue run + Pub/Sub progress
│   ├── (marketing)/                       # landing, pricing, docs, login
│   ├── dashboard/                         # signed-in workspace
│   └── record/                            # screen-capture page
├── components/
│   ├── ui/                                # Button, FeatureCard, NavBar, Footer
│   ├── motion.tsx                         # GSAP primitives (Reveal, Parallax, CountUp, Marquee)
│   ├── landing/AnimatedLanding.tsx        # full landing motion wiring
│   └── ui/echo-hero.tsx                   # cinematic video hero
└── lib/
    ├── gcp.ts                             # typed Firestore + Pub/Sub clients (lazy, ADC)
    └── agents/echo-agent.ts               # Google ADK-style LlmAgent (Vertex AI Gemini)

Dockerfile                                 # multi-stage Next.js standalone → Cloud Run
cloudbuild.yaml                            # Cloud Build pipeline → Cloud Run
.env.local.example                         # env template
```

---

## Design system

11x.ai editorial-desert. Deep teal `#0b252a` for narrative bands, four pastel tints (dusty-sky / mist-mint / wisteria / desert-clay) for feature cards, Playfair Display as the free ES Allianz substitute, hairline borders, pill buttons (999px), no drop shadows. Tokens are defined as CSS custom properties in `src/app/globals.css` under the Tailwind v4 `@theme` block.

Motion: GSAP `Reveal` / `StaggerReveal` / `Parallax` / `CountUp` / `Marquee` + framer-motion `WordsPullUp` for the hero. All animations respect `prefers-reduced-motion`.

---

## Demo script (4 min)

See `docs/demo-script.md`.

## Architecture

See `docs/architecture.md`.
