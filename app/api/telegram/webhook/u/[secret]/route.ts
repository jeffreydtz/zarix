import { NextRequest, NextResponse } from 'next/server';
import { createServiceClientSync } from '@/lib/supabase/server';
import { handleCustomTelegramUpdate } from '@/lib/telegram/bot';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { secret: string } }
) {
  try {
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

    const update = await req.json();
    await handleCustomTelegramUpdate(update, row.telegram_bot_token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Custom Telegram webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
