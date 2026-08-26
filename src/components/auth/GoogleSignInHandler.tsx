"use client";

import { useEffect, useState } from "react";
import { signInWithGoogleProfile } from "@/lib/auth/auth";

/**
 * Decode a Google Identity Services ID-token JWT. We don't verify the
 * signature here — the id_token was issued by Google over HTTPS to a
 * redirect_uri that's whitelisted in our OAuth client, and the
 * production path also sends a server-side check (TODO post-hackathon).
 * For a hackathon demo this is fine.
 */
function decodeJwt<T = Record<string, unknown>>(token: string): T | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(
      payload + "===".slice(0, (4 - (payload.length % 4)) % 4)
    );
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * Renders nothing, but on mount checks `window.location.hash` for the
 * `id_token` parameter that Google Identity Services appends when the
 * user signs in via `ux_mode: "redirect"`. If present, it signs the
 * user in via the same `signInWithGoogleProfile()` path used by the
 * legacy FedCM `gsi.prompt()` flow, then navigates to /dashboard.
 *
 * Lives on the home page because the OAuth client "Echo Web Client"
 * is configured with `https://echo-one-liard.vercel.app` (the site
 * root) as a single authorized redirect URI, and we want to keep
 * the hackathon setup as-is.
 */
export function GoogleSignInHandler() {
  const [status, setStatus] = useState<"checking" | "idle" | "error">(
    "checking"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (!hash) {
      setStatus("idle");
      return;
    }
    // GSI puts the id_token in the URL fragment, e.g. "#id_token=...&..."
    const params = new URLSearchParams(hash.substring(1));
    const idToken = params.get("id_token");
    const oauthError = params.get("error");
    if (!idToken && !oauthError) {
      setStatus("idle");
      return;
    }
    // Clean the URL immediately so a back-button press doesn't replay
    // the callback and so the address bar doesn't leak the id_token.
    window.history.replaceState(null, "", window.location.pathname);
    if (oauthError) {
      setError(oauthError);
      setStatus("error");
      return;
    }
    const claims = decodeJwt<{
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
    }>(idToken!);
    if (!claims?.sub || !claims.email || !claims.name) {
      setError("Google didn't return a usable profile.");
      setStatus("error");
      return;
    }
    const result = signInWithGoogleProfile({
      sub: claims.sub,
      email: claims.email,
      name: claims.name,
      picture: claims.picture,
    });
    if (!result.ok) {
      setError(result.error);
      setStatus("error");
      return;
    }
    // Hard navigation so the dashboard layout re-reads the session
    // and the "(Google)" pill in the sidebar populates.
    window.location.href = "/dashboard";
  }, []);

  if (status === "error" && error) {
    return (
      <div
        role="alert"
        className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-md rounded-2xl border border-desert-clay/40 bg-paper-white shadow-lg px-5 py-3 text-body-sm"
      >
        <p className="font-medium text-obsidian">
          Google sign-in didn’t complete
        </p>
        <p className="text-caption text-obsidian/70 mt-1">{error}</p>
        <a
          href="/login"
          className="text-caption text-obsidian underline-offset-2 hover:underline mt-2 inline-block"
        >
          Back to sign in
        </a>
      </div>
    );
  }
  return null;
}
