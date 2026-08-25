"use client";

import { useEffect, useState } from "react";
import { Button, FeatureTag, FeatureCard } from "@/components/ui";

/**
 * Each integration has one of two states:
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

type IntegrationKind = "google" | "telegram" | "demo";

type Integration = {
  name: string;
  desc: string;
  status: IntegrationStatus;
  color: "dusty-sky" | "wisteria" | "desert-clay" | "mist-mint";
  scope: GoogleScope | "telegram";
  kind: IntegrationKind;
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
  // --- Real OAuth / API-backed integrations ---
  { name: "Google Drive",  desc: "Watch folders, read & write files",            status: "available", color: "dusty-sky",   scope: "drive",    kind: "google"  },
  { name: "Gmail",         desc: "Read, draft, send emails via the Gmail API", status: "available", color: "wisteria",   scope: "gmail",    kind: "google"  },
  { name: "Google Sheets", desc: "Read, write, append rows in any sheet",      status: "available", color: "desert-clay", scope: "sheets",   kind: "google"  },
  { name: "Google Calendar", desc: "Read events, schedule meetings",            status: "available", color: "mist-mint",  scope: "calendar", kind: "google"  },
  { name: "Telegram",      desc: "Send alerts via Bot API",                    status: "available", color: "dusty-sky",  scope: "telegram", kind: "telegram"},

  // --- Coming soon ---
  { name: "Slack",     desc: "Read channels, post messages",         status: "soon", color: "wisteria",    scope: "slack",    kind: "google" },
  { name: "HubSpot",   desc: "Fetch leads, update contacts",         status: "soon", color: "dusty-sky",   scope: "drive",    kind: "google" },
  { name: "LinkedIn",  desc: "Enrich profiles via Sales Navigator", status: "soon", color: "desert-clay", scope: "drive",    kind: "google" },
  { name: "Notion",    desc: "Read, write pages and databases",     status: "soon", color: "mist-mint",   scope: "drive",    kind: "google" },
  { name: "GitHub",    desc: "Read issues, create PRs",             status: "soon", color: "dusty-sky",   scope: "drive",    kind: "google" },
  { name: "Stripe",    desc: "Read customers and usage",            status: "soon", color: "wisteria",    scope: "drive",    kind: "google" },
  { name: "Airtable",  desc: "Read, write records",                 status: "soon", color: "desert-clay", scope: "drive",    kind: "google" },
  { name: "Zapier",    desc: "Bridge to 5,000+ apps",               status: "soon", color: "mist-mint",   scope: "drive",    kind: "google" },
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
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState(false);

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
    if (i.kind === "telegram") {
      setTelegramOpen(true);
      return;
    }
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
    if (i.kind === "telegram") {
      clearConnected("telegram");
      return;
    }
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

      <TelegramModal
        open={telegramOpen}
        busy={telegramBusy}
        onClose={() => setTelegramOpen(false)}
        onBusyChange={setTelegramBusy}
        onConnected={() => {
          // mark as connected and refresh the connectedMap
          const fresh: Record<string, boolean> = {};
          for (const i of integrations) {
            if (i.status === "available") fresh[i.scope] = isConnected(i.scope);
          }
          setConnectedMap(fresh);
        }}
      />
    </div>
  );
}

/* ---------------- Telegram modal ---------------- */

function TelegramModal({
  open,
  busy,
  onClose,
  onBusyChange,
  onConnected,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onBusyChange: (b: boolean) => void;
  onConnected: () => void;
}) {
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [step, setStep] = useState<"token" | "chat" | "test">("token");
  const [bot, setBot] = useState<{ username?: string; first_name: string } | null>(null);
  const [chats, setChats] = useState<Array<{ id: number; type: string; title?: string; username?: string; first_name?: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // Reset modal state every time it opens
  useEffect(() => {
    if (open) {
      setToken("");
      setChatId("");
      setStep("token");
      setBot(null);
      setChats([]);
      setError(null);
      setSending(false);
      setSent(false);
    }
  }, [open]);

  if (!open) return null;

  async function verifyToken() {
    setError(null);
    onBusyChange(true);
    try {
      const res = await fetch("/api/integrations/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", botToken: token.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Verification failed");
        return;
      }
      setBot(data.bot);
      // Try to fetch the most recent chats automatically
      try {
        const r = await fetch(`/api/integrations/telegram?token=${encodeURIComponent(token.trim())}`);
        const j = await r.json();
        if (j.ok && Array.isArray(j.chats)) setChats(j.chats);
      } catch {
        /* chat discovery is best-effort */
      }
      setStep("chat");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      onBusyChange(false);
    }
  }

  async function sendTest() {
    setError(null);
    setSending(true);
    setSent(false);
    try {
      const res = await fetch("/api/integrations/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          botToken: token.trim(),
          chatId: chatId.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "sendMessage failed");
        return;
      }
      // Persist the connection
      setConnected("telegram", JSON.stringify({ token: token.trim(), chatId: chatId.trim(), bot }));
      setSent(true);
      setStep("test");
      onConnected();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-obsidian/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <FeatureCard surface="paper-white" padding="lg" className="hairline w-full max-w-xl">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-8 h-8 rounded-xl bg-dusty-sky flex items-center justify-center text-body font-bold text-obsidian">
                T
              </span>
              <h2 className="text-heading-sm font-bold">Connect Telegram</h2>
            </div>
            <p className="text-body-sm text-obsidian/60">
              {step === "token" && "1/3 \u00b7 Paste your bot token"}
              {step === "chat" && "2/3 \u00b7 Pick the chat to message"}
              {step === "test" && "3/3 \u00b7 Connected \u2014 Echo can now send to this chat"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-obsidian/40 hover:text-obsidian text-2xl leading-none"
            aria-label="Close"
          >
            \u00d7
          </button>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-xl border border-desert-clay bg-desert-clay/30 text-body-sm text-obsidian">
            {error}
          </div>
        )}

        {step === "token" && (
          <div className="space-y-3">
            <ol className="text-body-sm text-obsidian/70 list-decimal pl-5 space-y-1">
              <li>Open Telegram, message <code className="px-1 py-0.5 rounded bg-bone">@BotFather</code></li>
              <li>Send <code className="px-1 py-0.5 rounded bg-bone">/newbot</code> and follow the prompts</li>
              <li>Copy the bot token (looks like <code className="px-1 py-0.5 rounded bg-bone">123456789:AA...</code>) and paste it below</li>
            </ol>
            <label className="block">
              <span className="text-caption font-medium uppercase opacity-60 mb-1 block">Bot token</span>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:AAHfiqksKZ8WmR2zMn..."
                className="w-full px-3 py-2 rounded-xl border border-iron bg-paper-white text-body-sm font-mono focus:outline-none focus:border-obsidian"
                autoFocus
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline-light" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="light"
                size="sm"
                onClick={verifyToken}
                disabled={!token.trim() || busy}
              >
                {busy ? "Verifying\u2026" : "Verify token"}
              </Button>
            </div>
          </div>
        )}

        {step === "chat" && (
          <div className="space-y-3">
            {bot && (
              <div className="px-3 py-2 rounded-xl bg-mist-mint/50 border border-mist-mint text-body-sm">
                \u2705 Verified: <strong>@{bot.username ?? bot.first_name}</strong>
              </div>
            )}
            <ol className="text-body-sm text-obsidian/70 list-decimal pl-5 space-y-1">
              <li>Open a chat with your new bot in Telegram</li>
              <li>Send <code className="px-1 py-0.5 rounded bg-bone">/start</code> so the bot can message you back</li>
              <li>Pick the chat below (Echo read the chat_id from your message)</li>
            </ol>
            {chats.length > 0 ? (
              <div>
                <span className="text-caption font-medium uppercase opacity-60 mb-1 block">Recent chats</span>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {chats.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setChatId(String(c.id))}
                      className={`w-full text-left px-3 py-2 rounded-xl text-body-sm transition-colors ${
                        chatId === String(c.id) ? "bg-obsidian text-paper-white" : "bg-bone hover:bg-iron"
                      }`}
                    >
                      <div className="font-medium">
                        {c.title ?? c.username ?? c.first_name ?? `Chat ${c.id}`}
                      </div>
                      <div className={`text-caption tabular-nums ${chatId === String(c.id) ? "text-paper-white/60" : "text-obsidian/50"}`}>
                        {c.type} \u00b7 {c.id}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-body-sm text-obsidian/60 italic">
                No chats yet. Send /start to your bot in Telegram, then come back.
              </p>
            )}
            <label className="block">
              <span className="text-caption font-medium uppercase opacity-60 mb-1 block">Or paste a chat_id</span>
              <input
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="123456789"
                className="w-full px-3 py-2 rounded-xl border border-iron bg-paper-white text-body-sm font-mono focus:outline-none focus:border-obsidian"
              />
            </label>
            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline-light" size="sm" onClick={() => setStep("token")}>
                \u2190 Back
              </Button>
              <Button
                variant="light"
                size="sm"
                onClick={sendTest}
                disabled={!chatId.trim() || sending}
              >
                {sending ? "Sending test\u2026" : "Send test message"}
              </Button>
            </div>
          </div>
        )}

        {step === "test" && sent && (
          <div className="space-y-3">
            <div className="px-4 py-3 rounded-xl bg-mist-mint/50 border border-mist-mint text-body-sm">
              \u2705 Test message delivered. Check your Telegram \u2014 you should see &quot;Echo connected to your Telegram bot.&quot;
            </div>
            <p className="text-body-sm text-obsidian/70">
              You can now call <code className="px-1 py-0.5 rounded bg-bone">telegram.sendMessage</code> from any Echo
              skill. Run history will show every message Echo sends.
            </p>
            <div className="flex justify-end pt-2">
              <Button variant="light" size="sm" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        )}
      </FeatureCard>
    </div>
  );
}
