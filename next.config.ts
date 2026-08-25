import type { NextConfig } from "next";

/**
 * Echo's Next.js config.
 *
 * `output: "standalone"` produces a minimal `.next/standalone/` tree the
 * Cloud Run Dockerfile copies in. Everything else stays at framework
 * defaults — Tailwind v4 + GSAP don't need any custom webpack config.
 */
const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
