import { ApiError } from '@/lib/api-handler';
import { executeRegistryTool, getRegistryTool, TOOL_CATALOG } from '@/lib/ai/registry';
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
  const allowed = new Set(scopesForPat(scopes));
  return TOOL_CATALOG.filter((tool) => tool.scopes.every((scope) => allowed.has(scope)));
}

export async function invokeRegistryForPat(input: {
  userId: string;
  scopes: string[];
  name: string;
  args: Record<string, unknown>;
  source: WriteChannel;
  req?: Request;
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
    });
    if (!tool.readOnly && input.req) {
      await recordIntegrationAudit({
        userId: input.userId,
        action: input.source === 'mcp' ? 'mcp.write' : 'api.write',
        source: input.source,
        ipHash: auditIpFromRequest(input.req),
        userAgent: auditUserAgent(input.req),
        metadata: { tool: input.name },
      });
    }
    return { response: result.response };
  });
}
