import type { NextConfig } from "next";

/**
 * Echo's Next.js config.
 *
 * Framework defaults — Tailwind v4 + GSAP don't need any custom webpack
 * config. For the Cloud Run production path the Dockerfile uses
 * `next build` and copies the resulting `.next/` tree, not the standalone
 * output (avoids a Next 16.3.1 .nft.json trace-file bug).
 *
 * `serverExternalPackages` lists packages that should NOT be bundled
 * by the server build. @sparticuz/chromium ships a `bin/` directory
 * of native browser binaries that the package extracts at runtime —
 * if esbuild relocates those files, executablePath() fails because
 * the original path no longer exists. Telling Next.js to leave the
 * package as-is on the server preserves the bin/ directory layout.
 *
 * `outputFileTracingIncludes` ensures the .tar.br binaries inside
 * @sparticuz/chromium/bin are included in the serverless function
 * bundle. Without this, Vercel's output file tracing only follows
 * JS imports and would strip the binary payloads.
 */
const nextConfig: NextConfig = {
  serverExternalPackages: [
    "@sparticuz/chromium",
    "puppeteer-core",
  ],
  outputFileTracingIncludes: {
    "/api/browser/preview": [
      "./node_modules/@sparticuz/chromium/bin/**",
    ],
  },
};

export default nextConfig;
