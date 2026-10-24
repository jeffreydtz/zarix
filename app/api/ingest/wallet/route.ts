import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api-handler';
import { authenticatePersonalAccessToken } from '@/lib/services/personal-access-tokens';
import { ingestWalletItem, sampleWalletPayload } from '@/lib/services/pending-inbox';
import { clientIpFromRequest, rateLimitAllow } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 32 * 1024;

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    if (!rateLimitAllow(`ingest-ip:${ip}`, 60, 60_000)) {
      return NextResponse.json({ error: 'Demasiados envíos. Esperá un minuto.' }, { status: 429 });
    }
    const auth = await authenticatePersonalAccessToken(req, 'ingest');
    if (!rateLimitAllow(`ingest-token:${auth.tokenId}`, 30, 60_000)) {
      return NextResponse.json({ error: 'Demasiados envíos con este token.' }, { status: 429 });
    }

    const len = Number(req.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new ApiError('El cuerpo es demasiado grande.', 413);

    const contentType = req.headers.get('content-type') || '';
    const raw = await req.text();
    if (raw.length > MAX_BYTES) throw new ApiError('El cuerpo es demasiado grande.', 413);

    let json: Record<string, unknown> | null = null;
    let text: string | null = null;
    if (contentType.includes('application/json') || raw.trim().startsWith('{')) {
      try {
        json = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        throw new ApiError('JSON inválido.', 400);
      }
    } else {
      text = raw;
    }

    const idempotencyKey =
      req.headers.get('idempotency-key') ||
      (typeof json?.idempotencyKey === 'string' ? json.idempotencyKey : null);

    const result = await ingestWalletItem({
      userId: auth.userId,
      json,
      text,
      idempotencyKey,
      req,
    });
    return NextResponse.json(
      {
        item: publicItem(result.item),
        duplicate: result.duplicate,
        autoConfirmed: result.autoConfirmed,
      },
      { status: result.duplicate ? 200 : 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/ingest/wallet',
    example: sampleWalletPayload(),
    note: 'Ejemplo. No son datos reales.',
  });
}

function publicItem(item: {
  id: string;
  amount: number | null;
  currency: string;
  merchant: string | null;
  card_name: string | null;
  status: string;
  created_at: string;
}) {
  return {
    id: item.id,
    amount: item.amount,
    currency: item.currency,
    merchant: item.merchant,
    cardName: item.card_name,
    status: item.status,
    createdAt: item.created_at,
  };
}
