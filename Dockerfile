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
# Pin pnpm 9 — pnpm 11 (auto-fetched by corepack from the lockfile's
# packageManager field) moved `onlyBuiltDependencies` to a new home
# that conflicts with the format used in pnpm-workspace.yaml. pnpm 9
# reads the top-level `onlyBuiltDependencies` list and respects the
# `pnpm.onlyBuiltDependencies` field in package.json. --force is
# needed because corepack's shim at /usr/local/bin/pnpm already exists.
RUN npm install -g pnpm@9 --force
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# ---------- 2. Build ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable
# Re-pin pnpm 9 in the builder stage too. corepack enable re-installs
# pnpm 11 (the version pinned in pnpm-lock.yaml) at /usr/local/bin/pnpm,
# overriding the pnpm 9 we installed in the deps stage. --force is
# required because the corepack shim already exists.
RUN npm install -g pnpm@9 --force
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

# Copy build output (default Next.js build, not standalone)
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

# Non-root user (distroless runs as nonroot by default)
USER nonroot

EXPOSE 8080
CMD ["node_modules/next/dist/bin/next", "start", "-p", "8080", "-H", "0.0.0.0"]
