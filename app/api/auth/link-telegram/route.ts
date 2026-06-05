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

    if (error) {
      const msg = (error as { message?: string }).message || '';
      const code = (error as { code?: string }).code || '';
      // Chat ya vinculado a otra cuenta: unique violation → mensaje claro, no 500.
      if (code === '23505' || /duplicate|unique|already|exist|vincul/i.test(msg)) {
        return NextResponse.json(
          { error: 'Ese chat de Telegram ya está vinculado a otra cuenta.' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Link Telegram error:', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}
