import { ApiError } from '@/lib/api-handler';
import {
  executeRegistryTool,
  getRegistryTool,
  isRemoteWriteTool,
  toolsVisibleToScopes as registryVisible,
} from '@/lib/ai/registry';
import { loadRegistryFinancialContext } from '@/lib/ai/registry/context';
import type { ToolScope, WriteChannel } from '@/lib/ai/registry/types';
import { recordIntegrationAudit, auditIpFromRequest, auditUserAgent, type AuditOutcome } from '@/lib/integrations/audit';
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

/** Header Idempotency-Key first, then body requestId. */
export function resolveIdempotencyKey(
  header: string | null | undefined,
  body: Record<string, unknown> | null | undefined
): string | undefined {
  const fromHeader = typeof header === 'string' ? header.trim() : '';
  if (fromHeader) return fromHeader;
  const fromBody = typeof body?.requestId === 'string' ? body.requestId.trim() : '';
  return fromBody || undefined;
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
  if (!tool.readOnly && !isRemoteWriteTool(input.name)) {
    throw new ApiError('Esta herramienta no está disponible por MCP/REST en v1.', 404);
  }
  const allowed = scopesForPat(input.scopes);
  const requestId =
    input.requestId ||
    (typeof input.args.requestId === 'string' ? input.args.requestId : undefined);

  const auditDenied = async () => {
    await recordIntegrationAudit({
      userId: input.userId,
      action: input.source === 'mcp' ? 'mcp.write' : 'api.write',
      source: input.source,
      ipHash: input.req ? auditIpFromRequest(input.req) : null,
      userAgent: input.req ? auditUserAgent(input.req) : null,
      metadata: { tool: input.name, requestId: requestId ?? null, outcome: 'denied' },
      outcome: 'denied',
    });
  };

  if (!tool.scopes.every((scope) => allowed.includes(scope))) {
    await auditDenied();
    throw new ApiError('Este token no tiene el permiso necesario.', 403);
  }

  return withPatUserScope(input.userId, async () => {
    const financialContext = await loadRegistryFinancialContext(input.userId);
    const auditWrite = async (outcome: AuditOutcome) => {
      if (tool.readOnly) return;
      await recordIntegrationAudit({
        userId: input.userId,
        action: input.source === 'mcp' ? 'mcp.write' : 'api.write',
        source: input.source,
        ipHash: input.req ? auditIpFromRequest(input.req) : null,
        userAgent: input.req ? auditUserAgent(input.req) : null,
        metadata: { tool: input.name, requestId: requestId ?? null, outcome },
        outcome,
      });
    };
    try {
      const result = await executeRegistryTool(input.name, input.args, {
        userId: input.userId,
        financialContext,
        source: input.source,
        allowedScopes: allowed,
        requestId,
        canConfirmRemote: input.scopes.includes('write:confirm'),
      });
      await auditWrite(
        result.response.needs_confirm ? 'ok' : result.response.success === false ? 'error' : 'ok'
      );
      return { response: result.response };
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        await auditWrite('denied');
      } else {
        await auditWrite('thrown');
      }
      throw error;
    }
  });
}
