# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Echo — Next.js 16 standalone build for Google Cloud Run
# Multi-stage: deps → build → runner
# Target image is distroless Node 20 for ~150MB final size
# ---------------------------------------------------------------------------

# ---------- 1. Dependencies ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# ---------- 2. Build ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time public env vars
ARG NEXT_PUBLIC_GCP_PROJECT_ID=echo-hackathon-2026
ENV NEXT_PUBLIC_GCP_PROJECT_ID=$NEXT_PUBLIC_GCP_PROJECT_ID
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---------- 3. Production runner (distroless, ~150MB) ----------
FROM gcr.io/distroless/nodejs20-debian12 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Non-root user (distroless runs as nonroot by default)
USER nonroot

EXPOSE 8080
CMD ["server.js"]
