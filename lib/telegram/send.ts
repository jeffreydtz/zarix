import { Telegraf } from 'telegraf';

const tokenCache = new Map<string, Telegraf>();

function telegrafForToken(token: string): Telegraf {
  if (!tokenCache.has(token)) {
    tokenCache.set(token, new Telegraf(token));
  }
  return tokenCache.get(token)!;
}

export async function sendTelegramDm(
  telegramChatId: number,
  text: string,
  options: {
    parse_mode?: 'Markdown' | 'HTML';
    botToken?: string | null;
  } = {}
): Promise<void> {
  const token = options.botToken?.trim() || process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error('No hay token de bot de Telegram (propio ni del servidor).');
  }
  const bot = telegrafForToken(token);
  const configured = Number(process.env.TELEGRAM_SEND_TIMEOUT_MS);
  const timeout = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 10_000) : 5_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    await bot.telegram.callApi('sendMessage', {
      chat_id: telegramChatId, text, parse_mode: options.parse_mode,
    }, { signal: controller.signal } as Parameters<typeof bot.telegram.callApi>[2]);
  } catch {
    // Provider URLs may include the bot credential. Preserve only safe context.
    throw new Error(controller.signal.aborted
      ? 'Telegram no confirmó el envío dentro del tiempo permitido.'
      : 'Telegram no confirmó el envío.');
  } finally {
    clearTimeout(timer);
  }
}
