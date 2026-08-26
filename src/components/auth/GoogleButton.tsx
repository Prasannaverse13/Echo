"use client";

import { useEffect, useRef, useState } from "react";
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

// Runtime type for the Identity Services (`accounts.id`) surface.
// We type-guard with this inline rather than augmenting the
// `Window.google` global, because the project already declares
// a strict (and incompatible) shape for `accounts.oauth2` in
// src/app/(dashboard)/integrations/page.tsx.
type Gsi = {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    // Optional prompt-dismissed hook. The GSI docs call this
    // `prompt_parent_id` + a "Cancel" callback that fires when the
    // user dismisses the One Tap UI without selecting an account.
    // (We register it on `prompt()` below via the global `gsi`.)
  }) => void;
  prompt: (notification?: (n: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean; isDismissedMoment: () => boolean; getDismissedReason: () => string | undefined }) => void) => void;
};
function readGsi(): Gsi | null {
  if (typeof window === "undefined") return null;
  const g = (window as unknown as { google?: { accounts?: { id?: Gsi } } })
    .google;
  return g?.accounts?.id ?? null;
}

/**
 * Decode a Google Identity Services JWT (we don't verify the
 * signature in the demo — that needs a server with Google's
 * public keys. In production you'd hit `/api/auth/google` to
 * verify, then read the same payload).
 */
function decodeJwt<T = Record<string, unknown>>(token: string): T | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(payload + "===".slice(0, (4 - (payload.length % 4)) % 4));
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

/**
 * The "Continue with Google" button. Clicking it either:
 *   - runs the real Google Identity Services prompt (when
 *     `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is set), or
 *   - opens an on-page demo Google-account picker.
 *
 * Either way, on success the user is signed in via the same
 * session used by the email/password path.
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
  // Synchronous re-entry guard for gsi.prompt(): Chrome's FedCM
  // implementation rejects any second `navigator.credentials.get`
  // while a previous one is still outstanding ("Only one
  // navigator.credentials.get request may be outstanding at one
  // time"), so we must not call prompt() twice in a row. Using a
  // ref (not state) makes the guard synchronous and immune to
  // re-render ordering. We clear it when the GSI callback fires
  // (sign-in succeeded) or when the user dismisses the prompt via
  // the `cancel_on_tap_outside` callback below.
  const promptInFlight = useRef(false);

  useEffect(() => {
    setClientId(getGoogleClientId());
  }, []);

  // Load Google Identity Services script if we have a client ID.
  useEffect(() => {
    if (!clientId) return;
    const id = "gsi-client";
    if (document.getElementById(id)) return;
    const s = document.createElement("script");
    s.id = id;
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }, [clientId]);

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

  function onClick() {
    if (busy) return;
    // Re-entry guard: if a previous gsi.prompt() is still pending
    // in Chrome's FedCM queue, calling it again is a no-op (Chrome
    // throws NotAllowedError). We swallow that case silently so the
    // user can click again once the FedCM state clears.
    if (promptInFlight.current) {
      setError(
        "Google sign-in is still finishing. If nothing appears, give it a second and try again."
      );
      return;
    }
    setError(null);
    const gsi = readGsi();
    if (clientId && gsi) {
      promptInFlight.current = true;
      gsi.initialize({
        client_id: clientId,
        callback: (response) => {
          // Sign-in succeeded → clear guard and continue.
          promptInFlight.current = false;
          const claims = decodeJwt<{
            sub?: string;
            email?: string;
            name?: string;
            picture?: string;
          }>(response.credential);
          if (!claims?.sub || !claims.email || !claims.name) {
            setError("Google didn't return a usable profile. Try again.");
            return;
          }
          handleProfile({
            sub: claims.sub,
            email: claims.email,
            name: claims.name,
            picture: claims.picture,
          });
        },
      });
      gsi.prompt((notification) => {
        // GSI calls this once it has decided whether to display the
        // prompt. If the user dismisses the prompt, or if GSI
        // decides not to display it (e.g. already signed in
        // elsewhere on the device), free the guard so the user can
        // try again. Otherwise the guard would stay locked until
        // the next page navigation.
        if (notification.isDismissedMoment() || notification.isNotDisplayed()) {
          promptInFlight.current = false;
          const reason = notification.getDismissedReason();
          if (reason && reason !== "credential_returned") {
            // Don't surface "credential_returned" — that's the
            // success path that already cleared the guard in the
            // callback above.
            setError(
              `Google didn't show the sign-in prompt (reason: ${reason}). Try again or use email + password.`
            );
          }
        }
      });
      return;
    }
    setShowPicker(true);
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
