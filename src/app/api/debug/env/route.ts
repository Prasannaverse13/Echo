import { NextResponse } from "next/server";

/**
 * Temporary debug endpoint — shows which env vars the deployed function
 * actually has access to (redacted). DELETE before going to prod.
 */
export async function GET() {
  return NextResponse.json({
    GEMINI_API_KEY_set: Boolean(process.env.GEMINI_API_KEY),
    GEMINI_API_KEY_len: (process.env.GEMINI_API_KEY || "").length,
    GEMINI_API_KEY_prefix: (process.env.GEMINI_API_KEY || "").slice(0, 6),
    GCP_PROJECT_ID: process.env.GCP_PROJECT_ID || null,
    GCP_ENABLED: process.env.GCP_ENABLED || null,
    GCP_VERTEX_LOCATION: process.env.GCP_VERTEX_LOCATION || null,
    GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT || null,
    GOOGLE_APPLICATION_CREDENTIALS_set: Boolean(
      process.env.GOOGLE_APPLICATION_CREDENTIALS
    ),
    VERCEL_OIDC_TOKEN_set: Boolean(process.env.VERCEL_OIDC_TOKEN),
    nodeEnv: process.env.NODE_ENV,
  });
}
