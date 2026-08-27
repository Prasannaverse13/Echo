"use client";

import { useEffect, useState } from "react";
import { signInWithGoogleProfile } from "@/lib/auth/auth";

/**
 * Renders nothing on a normal page load, but on mount checks
 * `window.location` for one of two Google OAuth callback shapes:
 *
 *   1. **Authorization Code flow** (the one we use now):
 *      `?code=...&state=...` in the query string. The client posts
 *      the code to `/api/auth/google/exchange`, which redeems it
 *      for an id_token using the server-side GOOGLE_CLIENT_SECRET
 *      and returns the user profile. The client then calls
 *      `signInWithGoogleProfile` and navigates to /dashboard.
 *
 *   2. **Legacy GSI redirect flow** (still in the bundle for the
 *      case where the OAuth client only has the root configured
 *      and someone triggers a `gsi.prompt()` with ux_mode:
 *      "redirect" via the GSI library):
 *      `#id_token=...&...` in the URL fragment. Same destination,
 *      just decodes the JWT locally.
 *
 * Lives on the home page because the OAuth client "Echo Web
 * Client" is configured with `https://echo-one-liard.vercel.app`
 * (the site root) as a single authorized redirect URI, and we
 * want to keep the hackathon setup as-is.
 */
export function GoogleSignInHandler() {
  const [status, setStatus] = useState<"checking" | "idle" | "error">(
    "checking"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1) Authorization code in the query string.
    const search = new URLSearchParams(window.location.search);
    const code = search.get("code");
    const stateParam = search.get("state");
    const oauthError = search.get("error");

    // 2) Legacy GSI id_token in the URL fragment.
    const hash = window.location.hash;
    const fragment = hash ? new URLSearchParams(hash.substring(1)) : null;
    const idToken = fragment?.get("id_token") ?? null;
    const fragmentError = fragment?.get("error") ?? null;

    if (!code && !oauthError && !idToken && !fragmentError) {
      setStatus("idle");
      return;
    }

    // Always clean the URL so a back-button press doesn't replay
    // the callback and so the address bar doesn't leak secrets.
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.hash
    );

    if (oauthError) {
      setError(oauthError);
      setStatus("error");
      return;
    }
    if (fragmentError) {
      setError(fragmentError);
      setStatus("error");
      return;
    }

    if (idToken) {
      // Legacy path: decode the id_token directly.
      const claims = decodeJwt<{
        sub?: string;
        email?: string;
        name?: string;
        picture?: string;
      }>(idToken);
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
      window.location.href = "/dashboard";
      return;
    }

    // Authorization code path: verify state then exchange.
    if (code) {
      const expectedState = sessionStorage.getItem("echo.oauth.state");
      if (expectedState && stateParam && expectedState !== stateParam) {
        setError("OAuth state mismatch — try signing in again.");
        setStatus("error");
        return;
      }
      sessionStorage.removeItem("echo.oauth.state");
      handleCodeExchange(code).then(
        (profile) => {
          const result = signInWithGoogleProfile(profile);
          if (!result.ok) {
            setError(result.error);
            setStatus("error");
            return;
          }
          window.location.href = "/dashboard";
        },
        (err: Error) => {
          setError(err.message || "Google sign-in failed.");
          setStatus("error");
        }
      );
    }
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

async function handleCodeExchange(
  code: string
): Promise<{ sub: string; email: string; name: string; picture?: string }> {
  const resp = await fetch("/api/auth/google/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      redirectUri: window.location.origin,
    }),
  });
  const data = (await resp.json().catch(() => ({}))) as {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
    error?: string;
    details?: string;
  };
  if (!resp.ok || data.error) {
    const msg = data.details
      ? `${data.error} — ${data.details}`
      : data.error || `Server returned ${resp.status}`;
    throw new Error(msg);
  }
  if (!data.sub || !data.email || !data.name) {
    throw new Error("Server returned a malformed profile.");
  }
  return {
    sub: data.sub,
    email: data.email,
    name: data.name,
    picture: data.picture,
  };
}

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
