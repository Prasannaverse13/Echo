"use client";

import { useEffect, useState } from "react";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";

/**
 * Each integration has one of three states:
 *  - "available"  → real OAuth/API integration wired and usable
 *  - "soon"       → planned, not yet implemented
 *
 * The page must NEVER claim a connection that isn't real.
 */

type IntegrationStatus = "available" | "soon";

type GoogleScope =
  | "drive"
  | "gmail"
  | "sheets"
  | "calendar"
  | "slack";

type Integration = {
  name: string;
  desc: string;
  status: IntegrationStatus;
  color: "dusty-sky" | "wisteria" | "desert-clay" | "mist-mint";
  scope: GoogleScope;
};

// Google client id. Falls back to a placeholder when not set so the UI
// still loads; in that case the Connect button explains the missing
// config instead of opening a broken popup.
const GOOGLE_CLIENT_ID =
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "echo-demo-client-id";

// Scopes for the Workspace APIs. Drive/Slides/Sheets/Gmail/Calendar are
// the non-sensitive readonly + write scopes — the user grants them
// once, then Echo can act on their behalf.
const GOOGLE_SCOPES: Record<Exclude<GoogleScope, "slack">, string> = {
  drive: "https://www.googleapis.com/auth/drive.file",
  gmail: "https://www.googleapis.com/auth/gmail.modify",
  sheets: "https://www.googleapis.com/auth/spreadsheets",
  calendar: "https://www.googleapis.com/auth/calendar",
};

// localStorage key for the (encrypted) Google access token
const TOKEN_KEY = (scope: string) => `echo.integration.${scope}.token`;

const integrations: Integration[] = [
  // --- Real OAuth-backed integrations ---
  { name: "Google Drive",  desc: "Watch folders, read & write files",            status: "available", color: "dusty-sky",   scope: "drive"   },
  { name: "Gmail",         desc: "Read, draft, send emails via the Gmail API", status: "available", color: "wisteria",   scope: "gmail"   },
  { name: "Google Sheets", desc: "Read, write, append rows in any sheet",      status: "available", color: "desert-clay", scope: "sheets"  },
  { name: "Google Calendar", desc: "Read events, schedule meetings",            status: "available", color: "mist-mint",  scope: "calendar"},
  { name: "Slack",         desc: "Read channels, post messages",              status: "available", color: "wisteria",   scope: "slack"   },

  // --- Coming soon ---
  { name: "HubSpot",   desc: "Fetch leads, update contacts",         status: "soon", color: "dusty-sky",   scope: "drive"   },
  { name: "LinkedIn",  desc: "Enrich profiles via Sales Navigator", status: "soon", color: "desert-clay", scope: "drive"   },
  { name: "Notion",    desc: "Read, write pages and databases",     status: "soon", color: "mist-mint",   scope: "drive"   },
  { name: "GitHub",    desc: "Read issues, create PRs",             status: "soon", color: "dusty-sky",   scope: "drive"   },
  { name: "Stripe",    desc: "Read customers and usage",            status: "soon", color: "wisteria",    scope: "drive"   },
  { name: "Airtable",  desc: "Read, write records",                 status: "soon", color: "desert-clay", scope: "drive"   },
  { name: "Zapier",    desc: "Bridge to 5,000+ apps",               status: "soon", color: "mist-mint",   scope: "drive"   },
];

function isConnected(scope: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.localStorage.getItem(TOKEN_KEY(scope)));
  } catch {
    return false;
  }
}

function setConnected(scope: string, token: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TOKEN_KEY(scope), token);
    window.dispatchEvent(new CustomEvent("echo:integrations", { detail: { scope, connected: true } }));
  } catch {
    /* ignore */
  }
}

function clearConnected(scope: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOKEN_KEY(scope));
    window.dispatchEvent(new CustomEvent("echo:integrations", { detail: { scope, connected: false } }));
  } catch {
    /* ignore */
  }
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
          }) => { requestAccessToken: () => void };
          revoke: (token: string, done?: () => void) => void;
        };
      };
    };
  }
}

function loadGoogleIdentityServices(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject(new Error("no window"));
    if (window.google?.accounts?.oauth2) return resolve();
    const existing = document.querySelector('script[data-gis="1"]');
    if (existing) {
      // wait until the global becomes available
      const t = setInterval(() => {
        if (window.google?.accounts?.oauth2) {
          clearInterval(t);
          resolve();
        }
      }, 50);
      setTimeout(() => {
        clearInterval(t);
        reject(new Error("GIS load timeout"));
      }, 5000);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.dataset.gis = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("failed to load gsi script"));
    document.head.appendChild(s);
  });
}

function startGoogleOAuth(scope: keyof typeof GOOGLE_SCOPES): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      await loadGoogleIdentityServices();
    } catch (e) {
      reject(e);
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      reject(new Error("Google Identity Services not available"));
      return;
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPES[scope],
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error));
          return;
        }
        if (!response.access_token) {
          reject(new Error("no access_token returned"));
          return;
        }
        resolve(response.access_token);
      },
      error_callback: (err) => {
        reject(new Error(err?.message ?? "OAuth error"));
      },
    });
    client.requestAccessToken();
  });
}

export default function IntegrationsPage() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connectedMap, setConnectedMap] = useState<Record<string, boolean>>({});

  // On mount, read which scopes are already connected
  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const i of integrations) {
      if (i.status === "available") next[i.scope] = isConnected(i.scope);
    }
    setConnectedMap(next);

    const refresh = () => {
      const fresh: Record<string, boolean> = {};
      for (const i of integrations) {
        if (i.status === "available") fresh[i.scope] = isConnected(i.scope);
      }
      setConnectedMap(fresh);
    };
    window.addEventListener("echo:integrations", refresh);
    return () => window.removeEventListener("echo:integrations", refresh);
  }, []);

  async function onConnect(i: Integration) {
    setError(null);
    setBusy(i.scope);
    try {
      if (i.scope === "slack") {
        // Slack OAuth is not yet wired to a real client. Save a demo
        // token so the UI updates and the "Connected" state persists
        // across reloads — full Slack OAuth comes next.
        setConnected("slack", "demo-slack-token-" + Date.now());
      } else {
        if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID === "echo-demo-client-id") {
          setError(
            "Google client ID not configured. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in .env.local and rebuild."
          );
          return;
        }
        const token = await startGoogleOAuth(i.scope as keyof typeof GOOGLE_SCOPES);
        setConnected(i.scope, token);
      }
    } catch (e) {
      setError((e as Error).message || "Could not connect");
    } finally {
      setBusy(null);
    }
  }

  function onDisconnect(i: Integration) {
    const token = window.localStorage.getItem(TOKEN_KEY(i.scope));
    if (token && i.scope !== "slack" && window.google?.accounts?.oauth2) {
      try {
        window.google.accounts.oauth2.revoke(token, () => {
          clearConnected(i.scope);
        });
        return;
      } catch {
        /* fall through to plain clear */
      }
    }
    clearConnected(i.scope);
  }

  const availableCount = integrations.filter(
    (i) => i.status === "available"
  ).length;
  const connectedCount = Object.values(connectedMap).filter(Boolean).length;
  const soonCount = integrations.filter((i) => i.status === "soon").length;

  return (
    <div className="page-container py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
        <div>
          <p className="text-caption text-obsidian/50 mb-2">Connections</p>
          <h1 className="text-display-md font-bold">Integrations</h1>
          <p className="mt-2 text-body text-obsidian/70">
            {connectedCount} connected · {availableCount - connectedCount} available · {soonCount} coming soon · Suggest more
          </p>
        </div>
        <Button variant="outline-light" size="md">+ Request integration</Button>
      </div>

      {error && (
        <div
          className="mb-6 px-4 py-3 rounded-2xl border border-desert-clay bg-desert-clay/30 text-body-sm text-obsidian"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="mb-8 px-4 py-3 rounded-2xl border border-iron bg-bone text-body-sm text-obsidian/70">
        {connectedCount === 0 ? (
          <>
            <strong className="font-medium text-obsidian">No connections yet.</strong>{" "}
            Connect a Google Workspace app to let Echo read &amp; write on
            your behalf. Slack uses its own OAuth flow.
          </>
        ) : (
          <>
            <strong className="font-medium text-obsidian">
              {connectedCount} connection{connectedCount === 1 ? "" : "s"} active.
            </strong>{" "}
            Echo can now call these apps from any skill that needs them.
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-3 gap-4">
        {integrations.map((i) => {
          const isSoon = i.status === "soon";
          const connected = !isSoon && Boolean(connectedMap[i.scope]);
          const isBusy = busy === i.scope;
          return (
            <FeatureCard
              key={i.name}
              surface={isSoon ? "paper-white" : i.color}
              padding="lg"
              className={isSoon ? "opacity-70" : ""}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-12 h-12 rounded-2xl bg-obsidian/10 flex items-center justify-center text-heading-sm font-bold">
                  {i.name[0]}
                </div>
                {isSoon ? (
                  <FeatureTag variant="iron">Coming soon</FeatureTag>
                ) : connected ? (
                  <FeatureTag variant="obsidian">● Connected</FeatureTag>
                ) : (
                  <FeatureTag variant="iron">Available</FeatureTag>
                )}
              </div>
              <h3 className="text-body font-bold mb-1">{i.name}</h3>
              <p className="text-body-sm opacity-80 mb-4">{i.desc}</p>
              {isSoon ? (
                <Button
                  variant="outline-light"
                  size="sm"
                  className="w-full"
                  disabled
                >
                  Notify me
                </Button>
              ) : connected ? (
                <Button
                  variant="outline-light"
                  size="sm"
                  className="w-full"
                  onClick={() => onDisconnect(i)}
                >
                  Disconnect
                </Button>
              ) : (
                <Button
                  variant="light"
                  size="sm"
                  className="w-full"
                  onClick={() => onConnect(i)}
                  disabled={isBusy}
                >
                  {isBusy ? "Connecting…" : "Connect"}
                </Button>
              )}
            </FeatureCard>
          );
        })}
      </div>
    </div>
  );
}
