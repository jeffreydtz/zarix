import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { telegramChatId } = body;

    if (!telegramChatId || typeof telegramChatId !== 'number') {
      return NextResponse.json(
        { error: 'telegramChatId required (number)' },
        { status: 400 }
      );
    }
    
    const { error } = await supabase.rpc('link_telegram_to_user', {
      p_user_id: user.id,
      p_telegram_chat_id: telegramChatId,
    });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Link Telegram error:', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}
