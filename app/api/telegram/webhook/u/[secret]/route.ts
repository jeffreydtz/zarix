import { NextRequest, NextResponse } from 'next/server';
import { createServiceClientSync } from '@/lib/supabase/server';
import { handleCustomTelegramUpdate } from '@/lib/telegram/bot';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { secret: string } }
) {
  const secret = params.secret;
  const supabase = createServiceClientSync();
  const { data: row } = await supabase
    .from('users')
    .select('telegram_bot_token')
    .eq('telegram_webhook_secret', secret)
    .maybeSingle();

  if (!row?.telegram_bot_token) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
