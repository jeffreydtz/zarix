import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient, createServiceClientSync } from '@/lib/supabase/server';
import { clientIpFromRequest, rateLimitAllow } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Genera un código de vinculación de un solo uso (10 min) para el usuario
// autenticado. El usuario lo envía al bot de Telegram, que lo canjea probando
// posesión del chat (ver lib/telegram/bot.ts → redeemLinkCode). Reemplaza el
// flujo viejo inseguro que usaba el telegram_chat_id como su propia "prueba".
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!rateLimitAllow(`tg-link:${user.id}:${clientIpFromRequest(req)}`, 8, 10 * 60 * 1000)) {
      return NextResponse.json(
        { error: 'Demasiados códigos. Esperá un rato y reintentá.' },
        { status: 429 }
      );
    }

    // 12 hex chars (48 bits): sigue siendo tipeable y deja de ser brute-forceable
    // en la ventana de 10 min.
    const code = randomBytes(6).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const service = createServiceClientSync();
    const { error } = await service
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
