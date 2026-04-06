import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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
    const { gemini_api_key, telegram_mode, telegram_bot_token } = body as {
      gemini_api_key?: string | null;
      telegram_mode?: 'shared' | 'custom';
      telegram_bot_token?: string | null;
    };

    const updates: Record<string, unknown> = {};

    if (gemini_api_key !== undefined) {
      const v =
        gemini_api_key === null || gemini_api_key === ''
          ? null
          : String(gemini_api_key).trim();
      updates.gemini_api_key = v;
    }

    if (telegram_mode === 'shared') {
      updates.telegram_bot_token = null;
      updates.telegram_webhook_secret = null;
    } else if (telegram_mode === 'custom') {
      const { data: existing } = await supabase
        .from('users')
        .select('telegram_bot_token, telegram_webhook_secret')
        .eq('id', user.id)
        .single();
      const token =
        (telegram_bot_token && String(telegram_bot_token).trim()) ||
        existing?.telegram_bot_token?.trim() ||
        '';
      if (!token) {
        return NextResponse.json(
          { error: 'Para bot propio necesitás el token que te da BotFather.' },
          { status: 400 }
        );
      }
      updates.telegram_bot_token = token;
      if (!existing?.telegram_webhook_secret) {
        updates.telegram_webhook_secret = randomBytes(24).toString('hex');
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ message: 'Sin cambios' });
    }

    const { error } = await supabase.from('users').update(updates).eq('id', user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const { data: fresh } = await supabase
      .from('users')
      .select('telegram_webhook_secret')
      .eq('id', user.id)
      .single();

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || '';
    const webhookUrl =
      fresh?.telegram_webhook_secret && baseUrl
        ? `${baseUrl}/api/telegram/webhook/u/${fresh.telegram_webhook_secret}`
        : null;

    return NextResponse.json({ ok: true, webhookUrl });
  } catch (e) {
    console.error('integrations POST:', e);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
