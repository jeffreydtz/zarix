import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { deriveCustomWebhookHeaderSecret } from '@/lib/telegram/webhook-auth';
import { errorResponse } from '@/lib/api-handler';
import { assertSameOrigin } from '@/lib/auth/origin';
import { getUserTelegramBotToken, setUserSecret } from '@/lib/secrets/user-secrets';
import { recordIntegrationAudit, auditIpFromRequest, auditUserAgent } from '@/lib/integrations/audit';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
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
    let secretsTouched = false;

    if (gemini_api_key !== undefined) {
      const v =
        gemini_api_key === null || gemini_api_key === ''
          ? null
          : String(gemini_api_key).trim();
      await setUserSecret(user.id, 'gemini_api_key', v);
      secretsTouched = true;
    }

    if (telegram_mode === 'shared') {
      await setUserSecret(user.id, 'telegram_bot_token', null);
      updates.telegram_webhook_secret = null;
      secretsTouched = true;
    } else if (telegram_mode === 'custom') {
      const existingToken = await getUserTelegramBotToken(user.id);
      const serviceClient = await createServiceClient();
      const { data: existing } = await serviceClient
        .from('users')
        .select('telegram_webhook_secret')
        .eq('id', user.id)
        .single();
      const token =
        (telegram_bot_token && String(telegram_bot_token).trim()) ||
        existingToken ||
        '';
      if (!token) {
        return NextResponse.json(
          { error: 'Para bot propio necesitás el token que te da BotFather.' },
          { status: 400 }
        );
      }
      await setUserSecret(user.id, 'telegram_bot_token', token);
      secretsTouched = true;
      if (!existing?.telegram_webhook_secret) {
        updates.telegram_webhook_secret = randomBytes(24).toString('hex');
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase.from('users').update(updates).eq('id', user.id);
      if (error) return errorResponse(error);
    } else if (!secretsTouched) {
      return NextResponse.json({ message: 'Sin cambios' });
    }

    if (secretsTouched) {
      await recordIntegrationAudit({
        userId: user.id,
        action: 'secrets.update',
        source: 'web',
        ipHash: auditIpFromRequest(req),
        userAgent: auditUserAgent(req),
        metadata: {
          gemini: gemini_api_key !== undefined,
          telegram: telegram_mode ?? null,
        },
      });
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
    const webhookSecretToken = fresh?.telegram_webhook_secret
      ? deriveCustomWebhookHeaderSecret(fresh.telegram_webhook_secret)
      : null;

    return NextResponse.json({ ok: true, webhookUrl, webhookSecretToken });
  } catch (e) {
    console.error('integrations POST');
    return errorResponse(e);
  }
}
