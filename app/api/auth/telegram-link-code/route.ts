import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Genera un código de vinculación de un solo uso (10 min) para el usuario
// autenticado. El usuario lo envía al bot de Telegram, que lo canjea probando
// posesión del chat (ver lib/telegram/bot.ts → redeemLinkCode). Reemplaza el
// flujo viejo inseguro que usaba el telegram_chat_id como su propia "prueba".
export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 8 hex chars en mayúscula: legible para copiar/pegar en el chat.
    const code = randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error } = await supabase
      .from('users')
      .update({
        telegram_link_code: code,
        telegram_link_code_expires_at: expiresAt,
      })
      .eq('id', user.id);

    if (error) {
      return NextResponse.json(
        { error: 'No se pudo generar el código.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ code, expiresAt });
  } catch (e) {
    console.error('telegram-link-code POST:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
