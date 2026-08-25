# scripts/bind-subscription.ps1
# One-time setup for the production worker. Creates the `echo-runs-worker`
# Pub/Sub subscription that the worker listens on. Idempotent — safe to re-run.
#
# Prereq: `gcloud auth login` and the project must be set:
#   gcloud config set project echo-hackathon-2026

# gcloud writes "Updates are available" to stderr on every call which
# PowerShell treats as a non-terminating error. We don't care — the gcloud
# binary is fine, this is just an "FYI you can update" message.
$ErrorActionPreference = 'Continue'

$Project = "echo-hackathon-2026"
$Topic = "echo-runs"
$Subscription = "echo-runs-worker"
$Region = "us-central1"

if (-not (Test-Path 'C:\tools\gcloud\google-cloud-sdk\bin\gcloud.cmd')) {
  Write-Host "gcloud CLI not found at C:\tools\gcloud\google-cloud-sdk\bin\gcloud.cmd" -ForegroundColor Red
  exit 1
}

Write-Host "==> Verifying topic $Topic exists" -ForegroundColor Cyan
& 'C:\tools\gcloud\google-cloud-sdk\bin\gcloud.cmd' pubsub topics describe $Topic --project=$Project 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "==> Topic $Topic not found, creating" -ForegroundColor Yellow
  & 'C:\tools\gcloud\google-cloud-sdk\bin\gcloud.cmd' pubsub topics create $Topic --project=$Project 2>&1 | Out-String
}

Write-Host "==> Creating subscription $Subscription (idempotent)" -ForegroundColor Cyan
$result = & 'C:\tools\gcloud\google-cloud-sdk\bin\gcloud.cmd' pubsub subscriptions create $Subscription `
  --topic=$Topic `
  --project=$Project `
  --ack-deadline=60 `
  --message-retention-duration=7d `
  --expiration-period=never 2>&1

if ($LASTEXITCODE -ne 0) {
  if ($result -match "ALREADY_EXISTS|already exists") {
    Write-Host "==> Subscription $Subscription already exists, OK" -ForegroundColor Green
  } else {
    Write-Host "==> ERROR creating subscription: $result" -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host "==> Subscription $Subscription created" -ForegroundColor Green
}

Write-Host ""
Write-Host "==> Done. The worker can now listen on:"
Write-Host "    projects/$Project/subscriptions/$Subscription"
Write-Host ""
Write-Host "==> Next: deploy the worker (Cloud Build -> echo-worker) or run locally:"
Write-Host "    pnpm worker"
Write-Host ""
Write-Host "==> Verify the subscription receives messages:"
Write-Host "    gcloud pubsub subscriptions pull $Subscription --project=$Project --auto-ack --limit=5"

