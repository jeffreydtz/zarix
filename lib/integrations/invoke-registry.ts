import { ApiError } from '@/lib/api-handler';
import { executeRegistryTool, getRegistryTool, toolsVisibleToScopes as registryVisible } from '@/lib/ai/registry';
import { loadRegistryFinancialContext } from '@/lib/ai/registry/context';
import type { ToolScope, WriteChannel } from '@/lib/ai/registry/types';
import { recordIntegrationAudit, auditIpFromRequest, auditUserAgent } from '@/lib/integrations/audit';
import { withPatUserScope } from '@/lib/supabase/request-scope';

export function scopesForPat(scopes: string[]): ToolScope[] {
  const allowed: ToolScope[] = [];
  if (scopes.includes('read')) allowed.push('read');
  if (scopes.includes('write')) allowed.push('write');
  if (scopes.includes('ingest')) allowed.push('ingest');
  return allowed;
}

export function toolsVisibleToScopes(scopes: string[]) {
  return registryVisible(scopesForPat(scopes));
}

export async function invokeRegistryForPat(input: {
  userId: string;
  scopes: string[];
  name: string;
  args: Record<string, unknown>;
  source: WriteChannel;
  req?: Request;
  requestId?: string | null;
}): Promise<{ response: Record<string, unknown> }> {
  const tool = getRegistryTool(input.name);
  if (!tool) throw new ApiError('Herramienta desconocida.', 404);
  const allowed = scopesForPat(input.scopes);
  if (!tool.scopes.every((scope) => allowed.includes(scope))) {
    throw new ApiError('Este token no tiene el permiso necesario.', 403);
  }
  return withPatUserScope(input.userId, async () => {
    const financialContext = await loadRegistryFinancialContext(input.userId);
    const result = await executeRegistryTool(input.name, input.args, {
      userId: input.userId,
      financialContext,
      source: input.source,
      allowedScopes: allowed,
      requestId: input.requestId || undefined,
    });
    if (!tool.readOnly) {
      await recordIntegrationAudit({
        userId: input.userId,
        action: input.source === 'mcp' ? 'mcp.write' : 'api.write',
        source: input.source,
        ipHash: input.req ? auditIpFromRequest(input.req) : null,
        userAgent: input.req ? auditUserAgent(input.req) : null,
        metadata: { tool: input.name, requestId: input.requestId ?? null },
      });
    }
    return { response: result.response };
  });
}
