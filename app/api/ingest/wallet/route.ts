import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api-handler';
import { authenticatePersonalAccessToken } from '@/lib/services/personal-access-tokens';
import { ingestWalletItem, sampleWalletPayload } from '@/lib/services/pending-inbox';
import { clientIpFromRequest, rateLimitAllow, rateLimitAllowShared } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 32 * 1024;

async function readCappedText(req: Request, maxBytes: number): Promise<string> {
  const declared = Number(req.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError('El cuerpo es demasiado grande.', 413);
  }
  const reader = req.body?.getReader();
  if (!reader) {
    const raw = await req.text();
    if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new ApiError('El cuerpo es demasiado grande.', 413);
    return raw;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      throw new ApiError('El cuerpo es demasiado grande.', 413);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c))).toString('utf8');
}

export async function POST(req: NextRequest) {
  try {
    const ip = clientIpFromRequest(req);
    if (!rateLimitAllow(`ingest-ip:${ip}`, 60, 60_000)) {
      return NextResponse.json({ error: 'Demasiados envíos. Esperá un minuto.' }, { status: 429 });
    }
    const auth = await authenticatePersonalAccessToken(req, 'ingest');
    if (!(await rateLimitAllowShared(`ingest-token:${auth.tokenId}`, 30, 60_000))) {
      return NextResponse.json({ error: 'Demasiados envíos con este token.' }, { status: 429 });
    }
    if (!(await rateLimitAllowShared(`ingest-user:${auth.userId}`, 60, 60_000))) {
      return NextResponse.json({ error: 'Demasiados envíos. Esperá un minuto.' }, { status: 429 });
    }

    const contentType = req.headers.get('content-type') || '';
    const raw = await readCappedText(req, MAX_BYTES);

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
  direction?: string;
  created_at: string;
}) {
  return {
    id: item.id,
    amount: item.amount,
    currency: item.currency,
    merchant: item.merchant,
    cardName: item.card_name,
    status: item.status,
    direction: item.direction === 'income' ? 'income' : 'expense',
    createdAt: item.created_at,
  };
}
