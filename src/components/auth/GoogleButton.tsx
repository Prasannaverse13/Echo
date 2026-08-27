"use client";

import { useEffect, useState } from "react";
import {
  signInWithGoogleProfile,
  getGoogleClientId,
  DEMO_GOOGLE_ACCOUNTS,
  type GoogleProfile,
} from "@/lib/auth/auth";

/**
 * The official "G" Google logo, inlined so we don't need to ship
 * a separate SVG asset. Same colours as Google's brand guidelines.
 */
function GoogleGLogo({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.4 29.5 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c11 0 19.5-8 19.5-19.5 0-1.2-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.4 29.5 4.5 24 4.5 16.3 4.5 9.7 9 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 43.5c5.4 0 10.3-2 14.1-5.4l-6.5-5.5C29.5 34 26.9 35 24 35c-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.5 39.6 16.2 43.5 24 43.5z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4.1 5.6l6.5 5.5c-.4.4 6.8-5 6.8-14.6 0-1.2-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

/**
 * The "Continue with Google" button. Clicking it either:
 *   - runs the real Google OAuth 2.0 consent flow (when
 *     `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set), or
 *   - opens an on-page demo Google-account picker.
 *
 * The real flow bypasses GSI entirely: we redirect straight to
 * `https://accounts.google.com/o/oauth2/v2/auth?response_type=code`
 * with the configured `redirect_uri`. Google bounces the user
 * back to that URL with `?code=...&state=...` in the query string.
 * The home page (GoogleSignInHandler) reads that, POSTs the code
 * to `/api/auth/google/exchange`, and signs the user in via
 * `signInWithGoogleProfile()`.
 *
 * We avoid the GSI library on purpose: its default UX is a small
 * FedCM "One Tap" card (not the full Google sign-in page the
 * user expects), and it gets blocked when Chrome has FedCM
 * disabled at the site level.
 */
export function GoogleButton({
  intent = "signin",
  label,
}: {
  intent?: "signin" | "signup";
  label?: string;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    setClientId(getGoogleClientId());
  }, []);

  function onClick() {
    if (busy) return;
    setError(null);
    if (clientId && typeof window !== "undefined") {
      // Build the OAuth consent URL ourselves. The OAuth client
      // "Echo Web Client" has `https://echo-one-liard.vercel.app`
      // configured as an authorized redirect URI, so the user
      // bounces back to the site root with `?code=...&state=...`
      // and GoogleSignInHandler picks it up.
      const state = crypto.randomUUID();
      sessionStorage.setItem("echo.oauth.state", state);
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", window.location.origin);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", "openid email profile");
      authUrl.searchParams.set("state", state);
      // Always show the account chooser — even if the user already
      // has a Google session in the browser, the OpenAI-style "Pick
      // an account" page is what we want.
      authUrl.searchParams.set("prompt", "select_account");
      window.location.href = authUrl.toString();
      return;
    }
    setShowPicker(true);
  }

  function handleProfile(profile: GoogleProfile) {
    setBusy(true);
    setError(null);
    const result = signInWithGoogleProfile(profile);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setShowPicker(false);
    // Hard navigation so the dashboard layout re-reads the session
    // and the "(Google)" pill in the sidebar populates.
    window.location.href = "/dashboard";
  }

  const buttonText =
    label ?? (intent === "signup" ? "Sign up with Google" : "Continue with Google");

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-full border border-iron bg-paper-white text-body-sm font-medium text-obsidian hover:bg-iron/10 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <GoogleGLogo size={18} />
        <span>{busy ? "Signing in…" : buttonText}</span>
      </button>
      {error && (
        <p className="mt-2 text-caption text-desert-clay" role="alert">
          {error}
        </p>
      )}
      {showPicker && (
        <GoogleAccountPicker
          onPick={handleProfile}
          onClose={() => setShowPicker(false)}
        />
      )}
    </>
  );
}

/**
 * In-page Google-account picker that looks like the real Google
 * "Choose an account" sheet. Used when no real Client ID is
 * configured — i.e. the hackathon demo and local dev.
 */
function GoogleAccountPicker({
  onPick,
  onClose,
}: {
  onPick: (p: GoogleProfile) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/40 backdrop-blur-sm p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Choose a Google account"
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-paper-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 flex items-center gap-3">
          <GoogleGLogo size={28} />
          <div>
            <p className="text-heading-sm font-bold">Sign in with Google</p>
            <p className="text-caption text-obsidian/60">
              to continue to <span className="font-medium text-obsidian">Echo</span>
            </p>
          </div>
        </div>
        <div className="border-t border-iron">
          <p className="px-6 py-3 text-caption text-obsidian/50 bg-iron/10">
            Choose an account
          </p>
          <ul>
            {DEMO_GOOGLE_ACCOUNTS.map((p) => (
              <li key={p.sub}>
                <button
                  type="button"
                  onClick={() => onPick(p)}
                  className="w-full flex items-center gap-3 px-6 py-3 hover:bg-iron/10 transition-colors text-left"
                >
                  <span className="flex-shrink-0 w-9 h-9 rounded-full bg-obsidian/10 text-obsidian font-bold flex items-center justify-center">
                    {p.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")
                      .toUpperCase()}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-body-sm font-medium truncate">
                      {p.name}
                    </span>
                    <span className="block text-caption text-obsidian/60 truncate">
                      {p.email}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="px-6 py-3 border-t border-iron text-caption text-obsidian/40 bg-iron/5">
          Demo picker — connects to a real Google account when{" "}
          <code className="font-mono text-obsidian/60">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> is set.
        </div>
        <div className="px-6 py-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-caption text-obsidian/60 hover:text-obsidian"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
