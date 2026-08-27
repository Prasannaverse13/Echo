# Echo — Deploy Pipeline

Triggered on every push to `main` via Cloud Build.

- **Trigger**: `deploy-on-push` (2nd gen, `^main$`, `cloudbuild.yaml`)
- **Region**: `us-central1`
- **Service account**: `cloud-build-deployer@echo-hackathon-2026.iam.gserviceaccount.com`
  with `roles/cloudbuild.builds.editor`, `roles/run.admin`, `roles/iam.serviceAccountUser`

## What gets built

Three images from one repo:

| Image | Service | Source |
|---|---|---|
| `echo` | Next.js API (Vercel-mirrored to Cloud Run for the WebMCP path) | repo root |
| `echo-worker` | Pub/Sub-driven ADK agent runner | `src/worker/` |
| `echo-browser` | Playwright headless executor (the one agents call) | `browser-executor/` |

## What gets deployed

All three pushed to Artifact Registry, then `gcloud run deploy` on each with
internal-only ingress for `echo-worker` and `echo-browser`.

## Watching

- Console: https://console.cloud.google.com/cloud-build/builds?project=echo-hackathon-2026
- Triggers: https://console.cloud.google.com/cloud-build/triggers?project=echo-hackathon-2026

## Manual replay

`gcloud builds triggers run deploy-on-push --region=us-central1 --project=echo-hackathon-2026`
