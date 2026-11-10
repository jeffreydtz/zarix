import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api-handler';
import { verifyConfiguredSecret } from '@/lib/telegram/webhook-auth';
import { clientIpFromRequest, rateLimitAllow } from '@/lib/rate-limit';
import { readCappedText } from '@/lib/http/capped-body';
import { MAX_EMAIL_JSON_BYTES } from '@/lib/integrations/statement-parse';
import { parseInboundEmailPayload } from '@/lib/integrations/inbound-email';
import { inboundEmailConfigured, lookupMailboxUserId } from '@/lib/services/inbound-mailbox';
import { ingestEmailPayload } from '@/lib/services/statement-ingest';
import { recordIntegrationAudit } from '@/lib/integrations/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function webhookSecretFrom(req: NextRequest): string | null {
  const header =
    req.headers.get('x-inbound-email-secret') ||
    req.headers.get('x-webhook-secret') ||
    req.headers.get('authorization');
  if (!header) return null;
  const bearer = header.match(/^Bearer\s+(\S+)/i);
  return bearer?.[1] ?? header;
}

export async function POST(req: NextRequest) {
  try {
    if (!inboundEmailConfigured()) {
      throw new ApiError('Inbound email no está configurado.', 503);
    }
    if (!verifyConfiguredSecret(webhookSecretFrom(req), process.env.INBOUND_EMAIL_WEBHOOK_SECRET)) {
      throw new ApiError('Unauthorized', 401);
    }
    const ip = clientIpFromRequest(req);
    if (!rateLimitAllow(`inbound-email:${ip}`, 30, 60_000)) {
      throw new ApiError('Demasiados envíos. Esperá un minuto.', 429);
    }

    const raw = await readCappedText(req, MAX_EMAIL_JSON_BYTES);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new ApiError('JSON inválido.', 400);
    }
    const payload = parseInboundEmailPayload(json);
    const token = payload.mailboxToken;
    const userId = await lookupMailboxUserId(token);
    if (!userId) {
      throw new ApiError('Buzón desconocido.', 404);
    }

    const result = await ingestEmailPayload({
      userId,
      text: payload.text,
      subject: payload.subject,
      from: payload.from,
      messageId: payload.messageId,
      attachments: payload.attachments,
    });
    await recordIntegrationAudit({
      userId,
      action: 'ingest.email',
      source: 'email',
      metadata: { parkedCount: result.parked, parser: result.parser },
      outcome: 'ok',
    });
    return NextResponse.json(
      {
        parked: result.parked,
        duplicates: result.duplicates,
        installments: result.installments,
        autoConfirmed: false,
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/ingest/email',
    configured: inboundEmailConfigured(),
    note: 'Webhook genérico. Nada se registra sin confirmar en Pendientes. No se crean cuentas de proveedores desde el código.',
  });
}
