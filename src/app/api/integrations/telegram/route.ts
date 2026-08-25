import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/integrations/telegram
 *
 * Verifies a Telegram bot token by calling `getMe` and (optionally) sends
 * a test message to a given chat_id. Echo uses bot-token auth (not OAuth)
 * for Telegram because Telegram doesn't expose a user OAuth flow — you
 * create a bot via @BotFather, drop the token + default chat_id into Echo,
 * and Echo can `sendMessage` on the bot's behalf.
 *
 * Body:
 *   - action: "verify"  — call getMe, return { ok, bot }
 *   - action: "test"    — verify + sendMessage("✅ Echo connected to your Telegram bot.")
 *   - action: "send"    — verify + sendMessage({ text })
 *
 * On success Echo stores the (token, chatId) pair in localStorage on the
 * client (mirrors how the Google OAuth flow works).
 */
interface TelegramRequest {
  action: "verify" | "test" | "send";
  botToken: string;
  chatId?: string | number;
  text?: string;
}

const TL_BASE = "https://api.telegram.org";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as TelegramRequest;

  if (!body.botToken || typeof body.botToken !== "string" || !body.botToken.match(/^\d+:[A-Za-z0-9_-]{30,}$/)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Bot token looks invalid. Format is 123456789:AA... — get it from @BotFather on Telegram.",
      },
      { status: 400 }
    );
  }

  // Always verify the token first
  let bot: { id: number; is_bot: boolean; first_name: string; username?: string } | null = null;
  try {
    const res = await fetch(`${TL_BASE}/bot${body.botToken}/getMe`, { cache: "no-store" });
    const data = (await res.json()) as { ok: boolean; result?: typeof bot; description?: string };
    if (!data.ok || !data.result) {
      return NextResponse.json(
        { ok: false, error: data.description ?? "Telegram rejected the bot token." },
        { status: 401 }
      );
    }
    bot = data.result;
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Could not reach Telegram: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  if (body.action === "verify") {
    return NextResponse.json({ ok: true, bot });
  }

  if (!body.chatId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "chatId is required for test/send. Open your bot in Telegram, send /start, then pass the chatId Echo can read from the next /getUpdates response.",
      },
      { status: 400 }
    );
  }

  const text = body.text ?? "✅ Echo connected to your Telegram bot.";
  try {
    const res = await fetch(`${TL_BASE}/bot${body.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: body.chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
      cache: "no-store",
    });
    const data = (await res.json()) as { ok: boolean; description?: string };
    if (!data.ok) {
      return NextResponse.json(
        { ok: false, error: data.description ?? "Telegram sendMessage failed." },
        { status: 502 }
      );
    }
    return NextResponse.json({ ok: true, bot, sent: true, text });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `sendMessage failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}

/**
 * GET /api/integrations/telegram
 *
 * Helper: returns the most recent chat_id that messaged the bot. Echo
 * shows this in the UI so the user can pick the right chat to send to
 * without having to leave the dashboard.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) {
    return NextResponse.json({ ok: false, error: "token query param required" }, { status: 400 });
  }
  try {
    const res = await fetch(`${TL_BASE}/bot${token}/getUpdates?limit=20&timeout=0`, { cache: "no-store" });
    const data = (await res.json()) as {
      ok: boolean;
      result?: Array<{ message?: { chat: { id: number; type: string; title?: string; username?: string; first_name?: string } } }>;
    };
    if (!data.ok) {
      return NextResponse.json({ ok: false, error: "Telegram rejected the token." }, { status: 401 });
    }
    const seen = new Map<number, { id: number; type: string; title?: string; username?: string; first_name?: string }>();
    for (const update of data.result ?? []) {
      const chat = update.message?.chat;
      if (chat) seen.set(chat.id, chat);
    }
    return NextResponse.json({ ok: true, chats: Array.from(seen.values()) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `getUpdates failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
