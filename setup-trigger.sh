#!/usr/bin/env bash
# Setup script for echo-hackathon-2026 Cloud Build trigger
# Run this in your authed GCP Cloud Shell (the one in console.cloud.google.com)
# Project: echo-hackathon-2026 (project number 431018085923)

set -euo pipefail

PROJECT=echo-hackathon-2026
REGION=us-central1
REPO_OWNER=Prasannaverse13
REPO_NAME=Echo
CONNECTION_NAME=echo-github-connection
SA_NAME=cloud-build-deployer
SA_DISPLAY="Cloud Build Deployer"
TRIGGER_NAME=deploy-on-push

echo "==> Setting project"
gcloud config set project "$PROJECT"

echo "==> Listing existing connections"
gcloud builds connections list --region="$REGION" \
  --format="table(name,disabled,project)"

echo "==> Listing linked repos (should be empty before linking)"
gcloud builds repos list --region="$REGION" \
  --connection="$CONNECTION_NAME" || true

echo "==> Linking $REPO_OWNER/$REPO_NAME to $CONNECTION_NAME"
gcloud builds repos create \
  --connection="projects/$PROJECT/locations/$REGION/connections/$CONNECTION_NAME" \
  --remote-uri="https://github.com/$REPO_OWNER/$REPO_NAME" \
  --region="$REGION"

echo "==> Listing existing triggers (should be empty before creating)"
gcloud builds triggers list --region="$REGION" || true

echo "==> Creating user-managed service account $SA_NAME with required roles"
gcloud iam service-accounts create "$SA_NAME" \
  --project="$PROJECT" \
  --display-name="$SA_DISPLAY" || echo "(SA may already exist)"

SA_EMAIL="$SA_NAME@$PROJECT.iam.gserviceaccount.com"

for ROLE in roles/cloudbuild.builds.editor roles/run.admin roles/iam.serviceAccountUser; do
  echo "  Granting $ROLE to $SA_EMAIL"
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE" \
    --condition=None >/dev/null
done

echo "==> Creating Cloud Build trigger $TRIGGER_NAME"
gcloud builds triggers create github \
  --project="$PROJECT" \
  --region="$REGION" \
  --name="$TRIGGER_NAME" \
  --repo="$REPO_OWNER/$REPO_NAME" \
  --repo-region="$REGION" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml" \
  --service-account="projects/$PROJECT/serviceAccounts/$SA_EMAIL"

echo "==> Verifying"
gcloud builds triggers list --region="$REGION" \
  --format="table(name,disabled,branch_name,build_config)"
gcloud builds repos list --region="$REGION" \
  --connection="$CONNECTION_NAME" \
  --format="table(name,remoteUri)"

echo ""
echo "✅ Done. Next: push a commit to main on $REPO_OWNER/$REPO_NAME to trigger a build."
echo "   Monitor: https://console.cloud.google.com/cloud-build/builds?project=$PROJECT"
