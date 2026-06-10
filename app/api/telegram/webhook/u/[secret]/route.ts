import { NextRequest, NextResponse } from 'next/server';
import { createServiceClientSync } from '@/lib/supabase/server';
import { handleCustomTelegramUpdate } from '@/lib/telegram/bot';
import { timingSafeStringEqual } from '@/lib/secure-compare';

export const dynamic = 'force-dynamic';
// Igual que el webhook compartido: damos margen al loop de Gemini para que la
// función no se corte y Telegram no re-entregue (evita movimientos duplicados).
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: { secret: string } }
) {
  const secret = params.secret;
  const supabase = createServiceClientSync();
  const { data: row } = await supabase
    .from('users')
    .select('telegram_bot_token, telegram_webhook_secret')
    .eq('telegram_webhook_secret', secret)
    .maybeSingle();

  // Defensa en profundidad: el .eq() de la DB no es timing-safe, re-validamos
  // el secret con comparación en tiempo constante (mismo patrón que el webhook compartido).
  if (
    !row?.telegram_bot_token ||
    !timingSafeStringEqual(secret, row.telegram_webhook_secret)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Tras validar el secret del path, SIEMPRE 200: un 500 hace que Telegram
  // reintente el update y se dupliquen transacciones.
  try {
    const update = await req.json();
    await handleCustomTelegramUpdate(update, row.telegram_bot_token);
  } catch (error) {
    console.error('Custom Telegram webhook error:', error);
  }

  return NextResponse.json({ ok: true });
}
