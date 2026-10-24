import { AsyncLocalStorage } from 'node:async_hooks';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { TOOL_CATALOG, TOOL_SCHEMAS } from '@/lib/ai/registry';
import { invokeRegistryForPat, toolsVisibleToScopes } from '@/lib/integrations/invoke-registry';
import { authenticatePersonalAccessToken } from '@/lib/services/personal-access-tokens';
import { looksLikePersonalAccessToken, parseBearerToken } from '@/lib/auth/personal-access-token';
import { mcpOAuthEnabled } from '@/lib/auth/mcp-oauth';
import type { z } from 'zod';

const authStore = new AsyncLocalStorage<AuthInfo>();

function currentAuth(extra?: { authInfo?: AuthInfo }): AuthInfo | undefined {
  return extra?.authInfo || authStore.getStore() || undefined;
}

const mcpInner = createMcpHandler(
  (server) => {
    for (const tool of TOOL_CATALOG) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: TOOL_SCHEMAS[tool.name as keyof typeof TOOL_SCHEMAS] as z.ZodTypeAny,
          annotations: tool.annotations,
        },
        async (args, extra) => {
          const info = currentAuth(extra);
          const userId = typeof info?.extra?.userId === 'string' ? info.extra.userId : '';
          const scopes = Array.isArray(info?.scopes) ? info.scopes : [];
          if (!userId) {
            return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'Unauthorized' }) }], isError: true };
          }
          const visible = toolsVisibleToScopes(scopes);
          if (!visible.some((item) => item.name === tool.name)) {
            return {
              content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'Este token no tiene el permiso necesario.' }) }],
              isError: true,
            };
          }
          const result = await invokeRegistryForPat({
            userId,
            scopes,
            name: tool.name,
            args: (args ?? {}) as Record<string, unknown>,
            source: 'mcp',
          });
          const failed = result.response.success === false;
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result.response) }],
            isError: failed,
          };
        }
      );
    }
  },
  { serverInfo: { name: 'zarix', version: '0.1.0' } },
  { disableSse: true, basePath: '/api', verboseLogs: false }
);

async function verifyMcpToken(req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  const token = bearer || parseBearerToken(req.headers.get('authorization')) || undefined;
  if (!token) return undefined;
  if (!looksLikePersonalAccessToken(token)) {
    if (mcpOAuthEnabled()) return undefined;
    return undefined;
  }
  const authed = await authenticatePersonalAccessToken(
    new Request(req.url, { headers: { authorization: `Bearer ${token}` } }),
    undefined,
    { source: 'mcp' }
  );
  return {
    token,
    clientId: authed.tokenId,
    scopes: authed.scopes,
    extra: { userId: authed.userId },
  };
}

export const mcpHandler = withMcpAuth(
  async (req) => {
    const info = (req as Request & { auth?: AuthInfo }).auth;
    if (info) return authStore.run(info, () => mcpInner(req));
    return mcpInner(req);
  },
  verifyMcpToken,
  {
    required: true,
    resourceMetadataPath: '/.well-known/oauth-protected-resource',
  }
);
