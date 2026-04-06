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
  await bot.telegram.sendMessage(telegramChatId, text, {
    parse_mode: options.parse_mode,
  });
}
