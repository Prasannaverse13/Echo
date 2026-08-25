import type { NextConfig } from "next";

/**
 * Echo's Next.js config.
 *
 * Framework defaults — Tailwind v4 + GSAP don't need any custom webpack
 * config. For the Cloud Run production path the Dockerfile uses
 * `next build` and copies the resulting `.next/` tree, not the standalone
 * output (avoids a Next 16.3.1 .nft.json trace-file bug).
 */
const nextConfig: NextConfig = {
  // (no overrides — keep framework defaults)
};

export default nextConfig;
