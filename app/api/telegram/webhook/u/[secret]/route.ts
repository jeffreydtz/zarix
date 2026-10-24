import { NextRequest, NextResponse } from 'next/server';
import { createServiceClientSync } from '@/lib/supabase/server';
import { handleCustomTelegramUpdate } from '@/lib/telegram/bot';
import {
  deriveCustomWebhookHeaderSecret,
  verifyConfiguredSecret,
} from '@/lib/telegram/webhook-auth';

export const dynamic = 'force-dynamic';
// Igual que el webhook compartido: damos margen al loop de Gemini para que la
// función no se corte y Telegram no re-entregue (evita movimientos duplicados).
export const maxDuration = 60;

export async function POST(req: NextRequest, props: { params: Promise<{ secret: string }> }) {
  const params = await props.params;
  const secret = params.secret;
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const headerSecret = req.headers.get('x-telegram-bot-api-secret-token');
  const expectedHeader = deriveCustomWebhookHeaderSecret(secret);
  if (!verifyConfiguredSecret(headerSecret, expectedHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClientSync();
  const { data: row } = await supabase
    .from('users')
    .select('id, telegram_chat_id, telegram_bot_token, telegram_bot_token_enc, telegram_webhook_secret')
    .eq('telegram_webhook_secret', secret)
    .maybeSingle();

  const { decryptStoredSecret } = await import('@/lib/secrets/user-secrets');
  const botToken = (await decryptStoredSecret(row?.telegram_bot_token_enc)) || row?.telegram_bot_token || '';

  if (
    !row ||
    !botToken ||
    !verifyConfiguredSecret(secret, row.telegram_webhook_secret)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Tras validar el secret del path, SIEMPRE 200: un 500 hace que Telegram
  // reintente el update y se dupliquen transacciones.
  try {
    const update = await req.json();
    // SEGURIDAD (fix cross-tenant): el bot propio actúa SIEMPRE como su dueño
    // (resuelto por el secret), nunca por el chat.id del payload.
    await handleCustomTelegramUpdate(update, botToken, {
      userId: row.id,
      chatId: row.telegram_chat_id ?? null,
    });
  } catch {
    console.error('Custom Telegram webhook error:');
  }

  return NextResponse.json({ ok: true });
}
