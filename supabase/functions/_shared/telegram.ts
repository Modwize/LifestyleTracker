// Thin Telegram Bot API client. Plain-text messages (no parse_mode) keep
// escaping simple; we can upgrade to HTML later if we need formatting.

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: { id: number; username?: string; first_name?: string };
    chat: { id: number; type: string };
    date: number;
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; username?: string };
    data: string;
    message?: { chat: { id: number } };
  };
}

export async function sendMessage(
  chatId: number,
  text: string,
  opts: { replyMarkup?: unknown; disableNotification?: boolean } = {},
): Promise<void> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_notification: opts.disableNotification ?? false,
  };
  if (opts.replyMarkup) body.reply_markup = opts.replyMarkup;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Telegram sendMessage ${r.status}: ${await r.text()}`);
}

export async function answerCallback(callbackQueryId: string, text?: string): Promise<void> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
  });
}

// Validate Telegram's secret_token header (set during setWebhook).
export function validateWebhookSecret(req: Request): boolean {
  const expected = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');
  if (!expected) return false;
  return req.headers.get('x-telegram-bot-api-secret-token') === expected;
}

// Inline keyboard helper for yes/no / accept/reject flows.
export function inlineKeyboard(buttons: Array<Array<{ text: string; data: string }>>) {
  return {
    inline_keyboard: buttons.map((row) =>
      row.map((b) => ({ text: b.text, callback_data: b.data })),
    ),
  };
}
