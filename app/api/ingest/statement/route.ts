import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse, requireUser } from '@/lib/api-handler';
import { assertSameOrigin } from '@/lib/auth/origin';
import { clientIpFromRequest, rateLimitAllow } from '@/lib/rate-limit';
import { accountsService } from '@/lib/services/accounts';
import { ingestStatementFile } from '@/lib/services/statement-ingest';
import { MAX_STATEMENT_BYTES } from '@/lib/integrations/statement-parse';
import { auditIpFromRequest, auditUserAgent, recordIntegrationAudit } from '@/lib/integrations/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const { user } = await requireUser();
    const ip = clientIpFromRequest(req);
    if (!rateLimitAllow(`statement-ingest:${user.id}:${ip}`, 10, 60_000)) {
      throw new ApiError('Demasiados envíos. Esperá un minuto.', 429);
    }
    const lengthHeader = req.headers.get('content-length');
    if (lengthHeader == null || lengthHeader === '') {
      throw new ApiError('Falta Content-Length.', 411);
    }
    const declared = Number(lengthHeader);
    if (!Number.isFinite(declared) || declared < 0) {
      throw new ApiError('Falta Content-Length.', 411);
    }
    if (declared > MAX_STATEMENT_BYTES + 256 * 1024) {
      throw new ApiError('El archivo supera 4 MB.', 413);
    }

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      throw new ApiError('Adjuntá un PDF o CSV del resumen o de la cuenta.', 400);
    }
    if (file.size > MAX_STATEMENT_BYTES) {
      throw new ApiError('El archivo supera 4 MB.', 413);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > MAX_STATEMENT_BYTES) {
      throw new ApiError('El archivo supera 4 MB.', 413);
    }

    const accountIdRaw = String(form.get('accountId') || '').trim();
    let accountId: string | null = null;
    if (accountIdRaw) {
      const accounts = await accountsService.list(user.id);
      const owned = accounts.find((a) => a.id === accountIdRaw);
      if (!owned) throw new ApiError('Esa cuenta no es tuya.', 400);
      accountId = owned.id;
    }

    const result = await ingestStatementFile({
      userId: user.id,
      bytes,
      filename: file.name,
      mimeType: file.type,
      accountId,
      source: 'statement',
    });
    await recordIntegrationAudit({
      userId: user.id,
      action: 'ingest.statement',
      source: 'statement',
      ipHash: auditIpFromRequest(req),
      userAgent: auditUserAgent(req),
      metadata: { parkedCount: result.parked, parser: result.parser },
      outcome: 'ok',
    });
    return NextResponse.json(
      {
        parked: result.parked,
        duplicates: result.duplicates,
        installments: result.installments,
        parser: result.parser,
        items: result.items,
        autoConfirmed: false,
        note: 'Nada se registró en el libro. Confirmá en Pendientes.',
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
