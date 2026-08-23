@echo off
set GCP_ENABLED=false
set GCP_PROJECT_ID=echo-hackathon-2026
set GCP_VERTEX_LOCATION=us-central1
set GCP_PUBSUB_TOPIC=echo-runs
cd /d C:\Users\Prasa\Downloads\google\echo
pnpm dev
