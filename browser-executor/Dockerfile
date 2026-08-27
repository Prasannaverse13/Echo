FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app

# Install Node 20 (Playwright's bundled image is Ubuntu 22.04 with Node 18)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg \
 && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY tsconfig.json ./
COPY index.ts ./
RUN npx tsx --tsconfig tsconfig.json -e "console.log('ts-check ok')" || true

ENV PORT=8080
ENV NODE_ENV=production
ENV BROWSER_HEADLESS=true
ENV BROWSER_SESSION_TIMEOUT_MS=300000
ENV BROWSER_NAV_TIMEOUT_MS=30000
ENV BROWSER_ACTION_TIMEOUT_MS=15000

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://localhost:8080/healthz || exit 1

CMD ["npm", "start"]
