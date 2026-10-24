import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api-handler';
import { authenticatePersonalAccessToken } from '@/lib/services/personal-access-tokens';
import { invokeRegistryForPat } from '@/lib/integrations/invoke-registry';
import { getRegistryTool } from '@/lib/ai/registry';
import { clientIpFromRequest, rateLimitAllow } from '@/lib/rate-limit';
import { hashClientIp } from '@/lib/integrations/audit';
import { readLimitedJsonBody } from '@/lib/http/body-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest, props: { params: Promise<{ name: string }> }) {
  try {
    const ipHash = hashClientIp(clientIpFromRequest(req));
    const { name } = await props.params;
    const tool = getRegistryTool(name);
    if (!tool) throw new ApiError('Herramienta desconocida.', 404);
    const needed = tool.readOnly ? 'read' : 'write';
    const auth = await authenticatePersonalAccessToken(req, needed, { source: 'api' });
    if (!rateLimitAllow(`v1-post:${auth.tokenId}:${ipHash}`, 60, 60_000)) {
      return NextResponse.json({ error: 'Demasiados intentos. Esperá un minuto.' }, { status: 429 });
    }
    const parsed = await readLimitedJsonBody(req);
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ApiError('JSON inválido.', 400);
    }
    const idempotencyKey = req.headers.get('idempotency-key');
    const result = await invokeRegistryForPat({
      userId: auth.userId,
      scopes: auth.scopes,
      name,
      args: parsed as Record<string, unknown>,
      source: 'api',
      req,
      requestId: idempotencyKey,
    });
    return NextResponse.json(result.response);
  } catch (error) {
    return errorResponse(error);
  }
}
