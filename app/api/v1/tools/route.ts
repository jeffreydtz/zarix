import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-handler';
import { authenticatePersonalAccessToken } from '@/lib/services/personal-access-tokens';
import { toolsVisibleToScopes } from '@/lib/integrations/invoke-registry';
import { zodToJsonSchema } from '@/lib/ai/registry/json-schema';
import { TOOL_SCHEMAS } from '@/lib/ai/registry';
import { clientIpFromRequest, rateLimitAllow } from '@/lib/rate-limit';
import { hashClientIp } from '@/lib/integrations/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const ipHash = hashClientIp(clientIpFromRequest(req));
    if (!rateLimitAllow(`v1-get:${ipHash}`, 60, 60_000)) {
      return NextResponse.json({ error: 'Demasiados intentos. Esperá un minuto.' }, { status: 429 });
    }
    const auth = await authenticatePersonalAccessToken(req, undefined, { source: 'api' });
    if (!rateLimitAllow(`v1-get:${auth.tokenId}:${ipHash}`, 60, 60_000)) {
      return NextResponse.json({ error: 'Demasiados intentos. Esperá un minuto.' }, { status: 429 });
    }
    const tools = toolsVisibleToScopes(auth.scopes).map((tool) => ({
      name: tool.name,
      description: tool.description,
      readOnly: tool.readOnly,
      scopes: tool.scopes,
      annotations: tool.annotations,
      inputSchema: zodToJsonSchema(TOOL_SCHEMAS[tool.name as keyof typeof TOOL_SCHEMAS]),
    }));
    return NextResponse.json({ tools });
  } catch (error) {
    return errorResponse(error);
  }
}
