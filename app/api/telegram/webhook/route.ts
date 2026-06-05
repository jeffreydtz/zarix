import { NextRequest, NextResponse } from 'next/server';
import { handleTelegramUpdate } from '@/lib/telegram/bot';
import { timingSafeStringEqual } from '@/lib/secure-compare';

export const dynamic = 'force-dynamic';
// El loop de function-calling de Gemini puede tardar; sin un límite alto la
// función se corta a mitad y Telegram re-entrega el update (doble movimiento).
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-telegram-bot-api-secret-token');

  if (!timingSafeStringEqual(secret, process.env.TELEGRAM_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Una vez autenticado el update, SIEMPRE devolvemos 200. Un 500 hace que
  // Telegram reintente el mismo update y se dupliquen transacciones. Los errores
  // se loguean y se le avisan al usuario vía bot.catch.
  try {
    const update = await req.json();
    await handleTelegramUpdate(update);
  } catch (error) {
    console.error('Telegram webhook error:', error);
  }

  return NextResponse.json({ ok: true });
}
