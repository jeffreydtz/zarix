import { NextRequest, NextResponse } from 'next/server';
import { ApiError, errorResponse } from '@/lib/api-handler';
import { authenticatePersonalAccessToken } from '@/lib/services/personal-access-tokens';
import { invokeRegistryForPat } from '@/lib/integrations/invoke-registry';
import { getRegistryTool } from '@/lib/ai/registry';
import { clientIpFromRequest, rateLimitAllow } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest, props: { params: Promise<{ name: string }> }) {
  try {
    const ip = clientIpFromRequest(req);
    if (!rateLimitAllow(`api-v1:${ip}`, 60, 60_000)) {
      return NextResponse.json({ error: 'Demasiados intentos. Esperá un minuto.' }, { status: 429 });
    }
    const { name } = await props.params;
    const tool = getRegistryTool(name);
    if (!tool) throw new ApiError('Herramienta desconocida.', 404);
    const needed = tool.readOnly ? 'read' : 'write';
    const auth = await authenticatePersonalAccessToken(req, needed, { source: 'api' });
    const args = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await invokeRegistryForPat({
      userId: auth.userId,
      scopes: auth.scopes,
      name,
      args,
      source: 'api',
      req,
    });
    return NextResponse.json(result.response);
  } catch (error) {
    return errorResponse(error);
  }
}
