/**
 * Notification helpers.
 *
 * Telegram: the user can optionally wire a bot token + chat id to
 * the Composer. When a run is dispatched, Echo pings the chat with
 * the run id + goal. This sells the "background, autonomous" story
 * for the demo recording. Setup:
 *
 *   1. Talk to @BotFather on Telegram, create a bot, copy the token.
 *   2. Open a chat with the bot and send /start. Copy the chat id
 *      from https://api.telegram.org/bot<token>/getUpdates
 *   3. Add to localStorage: `echo.${userId}.telegram = {token, chatId}`
 *   4. That's it — every dispatch fires a notification.
 *
 * Server-side Telegram is also possible via env vars
 * (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) on the dispatch
 * route; we don't have those wired into the route yet, but the
 * pattern is the same.
 */

const TG_KEY = "telegram";

interface TelegramConfig {
  token: string;
  chatId: string | number;
}

export function loadTelegramConfig(userId: string): TelegramConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`echo.${userId}.${TG_KEY}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TelegramConfig>;
    if (!parsed.token || !parsed.chatId) return null;
    return { token: parsed.token, chatId: parsed.chatId };
  } catch {
    return null;
  }
}

export function saveTelegramConfig(userId: string, config: TelegramConfig | null) {
  if (typeof window === "undefined") return;
  try {
    if (config) {
      window.localStorage.setItem(
        `echo.${userId}.${TG_KEY}`,
        JSON.stringify(config)
      );
    } else {
      window.localStorage.removeItem(`echo.${userId}.${TG_KEY}`);
    }
  } catch {
    /* ignore */
  }
}

/** Fire-and-forget Telegram message. If no config is set, this
 *  is a no-op. We never block the dispatch on it. */
export async function notifyDispatch(opts: {
  userId: string;
  runId: string;
  goal: string;
}): Promise<void> {
  const config = loadTelegramConfig(opts.userId);
  if (!config) return;
  const text = [
    "🚀 *Echo run dispatched*",
    "",
    `*Run id:* \`${opts.runId}\``,
    `*Goal:* ${opts.goal.slice(0, 280)}${opts.goal.length > 280 ? "…" : ""}`,
    "",
    `[View in Echo](https://echo-one-liard.vercel.app/runs/${opts.runId})`,
  ].join("\n");
  try {
    await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    // Telegram is best-effort. Log and move on.
    console.error("[notify] telegram send failed:", err);
  }
}
