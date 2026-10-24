import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const FIXTURE_USER = '11111111-1111-4111-8111-111111111111';
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClientSync: () => ({ from: mocks.from }),
}));

vi.mock('@/lib/integrations/invoke-registry', async () => {
  const actual = await vi.importActual<typeof import('@/lib/integrations/invoke-registry')>(
    '@/lib/integrations/invoke-registry'
  );
  return { ...actual, invokeRegistryForPat: mocks.invoke };
});

import { generatePersonalAccessToken } from '@/lib/auth/personal-access-token';
import { GET as openapi } from '@/app/api/v1/openapi.json/route';
import { GET as listTools } from '@/app/api/v1/tools/route';
import { POST as callTool } from '@/app/api/v1/tools/[name]/route';
import { GET as oauthMeta } from '@/app/.well-known/oauth-protected-resource/route';
import { buildOpenApiDocument } from '@/lib/api/v1/openapi';
import { TOOL_CATALOG } from '@/lib/ai/registry';

function chain(result: unknown) {
  const q: any = {};
  q.select = vi.fn().mockReturnValue(q);
  q.eq = vi.fn().mockReturnValue(q);
  q.is = vi.fn().mockReturnValue(q);
  q.order = vi.fn().mockReturnValue(q);
  q.maybeSingle = vi.fn().mockResolvedValue(result);
  q.single = vi.fn().mockResolvedValue(result);
  q.update = vi.fn().mockReturnValue(q);
  q.insert = vi.fn().mockResolvedValue({ error: null });
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.invoke.mockResolvedValue({ response: { success: true, accounts: [] } });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('REST /api/v1', () => {
  it('publishes OpenAPI for every registry tool without real user ids', () => {
    const doc = buildOpenApiDocument('https://example.invalid');
    expect(doc.openapi).toBe('3.1.0');
    for (const tool of TOOL_CATALOG) {
      expect(doc.paths[`/api/v1/tools/${tool.name}`]).toBeTruthy();
    }
    expect(JSON.stringify(doc)).not.toMatch(/hotmail/i);
    expect(JSON.stringify(doc)).not.toContain(FIXTURE_USER);
  });

  it('lists only tools allowed by the PAT scopes', async () => {
    const generated = generatePersonalAccessToken();
    mocks.from.mockImplementation(() => chain({
      data: {
        id: 'pat-1', user_id: FIXTURE_USER, scopes: ['read'], token_hash: generated.hash,
        revoked_at: null, last_used_at: null,
      },
      error: null,
    }));
    const res = await listTools(new NextRequest('http://localhost/api/v1/tools', {
      headers: { authorization: `Bearer ${generated.token}` },
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tools.every((t: { readOnly: boolean }) => t.readOnly)).toBe(true);
    expect(body.tools.some((t: { name: string }) => t.name === 'create_transaction')).toBe(false);
  });

  it('rejects write tools on a read-only token', async () => {
    const generated = generatePersonalAccessToken();
    mocks.from.mockImplementation(() => chain({
      data: {
        id: 'pat-1', user_id: FIXTURE_USER, scopes: ['read'], token_hash: generated.hash,
        revoked_at: null, last_used_at: null,
      },
      error: null,
    }));
    const res = await callTool(new NextRequest('http://localhost/api/v1/tools/create_transaction', {
      method: 'POST',
      headers: { authorization: `Bearer ${generated.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'expense', amount: 10 }),
    }), { params: Promise.resolve({ name: 'create_transaction' }) });
    expect(res.status).toBe(403);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('serves openapi.json without login', async () => {
    const res = await openapi(new NextRequest('http://localhost/api/v1/openapi.json'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paths['/api/v1/tools/get_accounts']).toBeTruthy();
  });
});

describe('MCP OAuth flag', () => {
  it('hides protected resource metadata when the flag is off', async () => {
    vi.stubEnv('ZARIX_MCP_OAUTH_ENABLED', '');
    const res = await oauthMeta(new NextRequest('http://localhost/.well-known/oauth-protected-resource'));
    expect(res.status).toBe(404);
    vi.unstubAllEnvs();
  });
});

describe('MCP /api/mcp', () => {
  it('rejects missing bearer tokens', async () => {
    const { POST } = await import('@/app/api/mcp/route');
    const res = await POST(new NextRequest('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    }));
    expect(res.status).toBe(401);
  });
});
