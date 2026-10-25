import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const FIXTURE_USER = '11111111-1111-4111-8111-111111111111';
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  invoke: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClientSync: () => ({ from: mocks.from, rpc: mocks.rpc }),
  createBareServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
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
import { GET as oauthMeta, OPTIONS as oauthOptions } from '@/app/.well-known/oauth-protected-resource/route';
import { buildOpenApiDocument } from '@/lib/api/v1/openapi';
import { remoteToolCatalog } from '@/lib/ai/registry';
import * as rateLimit from '@/lib/rate-limit';

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
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.invoke.mockResolvedValue({ response: { success: true, accounts: [] } });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('REST /api/v1', () => {
  it('publishes OpenAPI for remote v1 tools without real user ids', () => {
    const doc = buildOpenApiDocument('https://example.invalid');
    expect(doc.openapi).toBe('3.1.0');
    for (const tool of remoteToolCatalog()) {
      expect(doc.paths[`/api/v1/tools/${tool.name}`]).toBeTruthy();
    }
    expect(doc.paths['/api/v1/tools/create_transaction']).toBeTruthy();
    const createTxSchema = (doc.paths['/api/v1/tools/create_transaction'] as {
      post: { requestBody: { content: { 'application/json': { schema: { anyOf?: unknown[] } } } } };
    }).post.requestBody.content['application/json'].schema;
    expect(createTxSchema.anyOf?.length).toBe(2);
    expect(JSON.stringify(createTxSchema)).toContain('"confirm"');
    expect(JSON.stringify(createTxSchema)).toContain('"pendingId"');
    expect(doc.paths['/api/v1/tools/delete_last_transaction']).toBeUndefined();
    expect(doc.paths['/api/v1/tools/create_recurring']).toBeUndefined();
    expect(JSON.stringify(doc)).not.toMatch(/hotmail/i);
    expect(JSON.stringify(doc)).not.toContain(FIXTURE_USER);
  });

  it('lists only tools allowed by the PAT scopes', async () => {
    const generated = generatePersonalAccessToken();
    mocks.from.mockImplementation(() => chain({
      data: {
        id: 'pat-1', user_id: FIXTURE_USER, scopes: ['read'], token_hash: generated.hash,
        revoked_at: null, last_used_at: null, expires_at: '2099-01-01T00:00:00.000Z',
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
        revoked_at: null, last_used_at: null, expires_at: '2099-01-01T00:00:00.000Z',
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
    const res = await openapi();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paths['/api/v1/tools/get_accounts']).toBeTruthy();
    expect(body.servers[0].url).toBe('https://zarix-phi.vercel.app');
  });
});

describe('MCP OAuth flag', () => {
  it('hides protected resource metadata when the flag is off', async () => {
    vi.stubEnv('ZARIX_MCP_OAUTH_ENABLED', '');
    const res = await oauthMeta(new NextRequest('http://localhost/.well-known/oauth-protected-resource'));
    expect(res.status).toBe(404);
    const opt = oauthOptions();
    expect(opt.status).toBe(404);
    expect(opt.headers.get('access-control-allow-origin')).toBeNull();
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
    const body = await res.text();
    expect(body.toLowerCase()).not.toContain('stack');
    expect(body).not.toMatch(/mcp-handler|node_modules/);
  });

  it('returns 429 (not 401) when the MCP bucket is exhausted', async () => {
    const { POST } = await import('@/app/api/mcp/route');
    const spy = vi.spyOn(rateLimit, 'rateLimitAllow').mockReturnValue(false);
    const res = await POST(new NextRequest('http://localhost/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer zrxp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    }));
    spy.mockRestore();
    expect(res.status).toBe(429);
  });

  it('uses the shared per-token/per-user limiter instead of skipping it', async () => {
    const generated = generatePersonalAccessToken();
    mocks.from.mockImplementation(() => chain({
      data: {
        id: 'pat-1', user_id: FIXTURE_USER, scopes: ['read', 'write'], token_hash: generated.hash,
        hash_version: 1, revoked_at: null, last_used_at: null, expires_at: '2099-01-01T00:00:00.000Z',
      },
      error: null,
    }));
    const spy = vi.spyOn(rateLimit, 'rateLimitAllowShared').mockResolvedValue('exhausted');
    const { POST } = await import('@/app/api/mcp/route');
    const res = await POST(new NextRequest('http://localhost/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${generated.token}`,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    }));
    expect(res.status).toBe(429);
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls.some((call) => String(call[0]).startsWith('pat-token:'))).toBe(true);
    spy.mockRestore();
  });

  it('authenticates first, then rejects malformed JSON and oversized MCP bodies', async () => {
    const { POST } = await import('@/app/api/mcp/route');
    const unauthenticated = await POST(new NextRequest('http://localhost/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(80_000) },
      body: '{}',
    }));
    expect(unauthenticated.status).toBe(401);

    const generated = generatePersonalAccessToken();
    mocks.from.mockImplementation(() => chain({
      data: {
        id: 'pat-1', user_id: FIXTURE_USER, scopes: ['read', 'write'], token_hash: generated.hash,
        hash_version: 1, revoked_at: null, last_used_at: null, expires_at: '2099-01-01T00:00:00.000Z',
      },
      error: null,
    }));
    const malformed = await POST(new NextRequest('http://localhost/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${generated.token}`,
      },
      body: '{not-json',
    }));
    expect(malformed.status).toBe(400);

    const huge = await POST(new NextRequest('http://localhost/api/mcp', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${generated.token}`,
        'content-length': String(80_000),
      },
      body: '{}',
    }));
    expect(huge.status).toBe(413);
  });
});

describe('every v1 tool stays on the PAT user and respects scopes', () => {
  const OTHER = '22222222-2222-4222-8222-222222222222';

  it('rejects every write tool on a read-only token', async () => {
    const generated = generatePersonalAccessToken();
    mocks.from.mockImplementation(() => chain({
      data: {
        id: 'pat-1', user_id: FIXTURE_USER, scopes: ['read'], token_hash: generated.hash,
        revoked_at: null, last_used_at: null, expires_at: '2099-01-01T00:00:00.000Z',
      },
      error: null,
    }));
    for (const tool of remoteToolCatalog().filter((t) => !t.readOnly)) {
      const res = await callTool(new NextRequest(`http://localhost/api/v1/tools/${tool.name}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${generated.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true, amount: 10, type: 'expense' }),
      }), { params: Promise.resolve({ name: tool.name }) });
      expect(res.status, tool.name).toBe(403);
    }
    expect(mocks.invoke).not.toHaveBeenCalled();
  });

  it('invokes every tool as fixture A, never fixture B', async () => {
    const generated = generatePersonalAccessToken();
    mocks.from.mockImplementation(() => chain({
      data: {
        id: 'pat-1', user_id: FIXTURE_USER, scopes: ['read', 'write'], token_hash: generated.hash,
        revoked_at: null, last_used_at: null, expires_at: '2099-01-01T00:00:00.000Z',
      },
      error: null,
    }));
    mocks.invoke.mockImplementation(async (input: { userId: string; name: string }) => {
      expect(input.userId).toBe(FIXTURE_USER);
      expect(input.userId).not.toBe(OTHER);
      return { response: { ok: true, tool: input.name } };
    });
    const catalog = remoteToolCatalog();
    for (const tool of catalog) {
      const res = await callTool(new NextRequest(`http://localhost/api/v1/tools/${tool.name}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${generated.token}`, 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }), { params: Promise.resolve({ name: tool.name }) });
      expect(res.status, tool.name).toBe(200);
    }
    expect(mocks.invoke).toHaveBeenCalledTimes(catalog.length);

    const removed = await callTool(new NextRequest('http://localhost/api/v1/tools/delete_last_transaction', {
      method: 'POST',
      headers: { authorization: `Bearer ${generated.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    }), { params: Promise.resolve({ name: 'delete_last_transaction' }) });
    expect(removed.status).toBe(404);
  });

  it('rejects malformed JSON and oversized bodies, and honors Idempotency-Key on retry', async () => {
    const generated = generatePersonalAccessToken();
    mocks.from.mockImplementation(() => chain({
      data: {
        id: 'pat-1', user_id: FIXTURE_USER, scopes: ['read', 'write'], token_hash: generated.hash,
        revoked_at: null, last_used_at: null, expires_at: '2099-01-01T00:00:00.000Z',
      },
      error: null,
    }));
    const malformed = await callTool(new NextRequest('http://localhost/api/v1/tools/get_accounts', {
      method: 'POST',
      headers: { authorization: `Bearer ${generated.token}`, 'content-type': 'application/json' },
      body: '{not-json',
    }), { params: Promise.resolve({ name: 'get_accounts' }) });
    expect(malformed.status).toBe(400);

    const huge = await callTool(new NextRequest('http://localhost/api/v1/tools/get_accounts', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${generated.token}`,
        'content-type': 'application/json',
        'content-length': String(80_000),
      },
      body: '{}',
    }), { params: Promise.resolve({ name: 'get_accounts' }) });
    expect(huge.status).toBe(413);

    const key = 'idem-retry-fixture-001';
    const first = await callTool(new NextRequest('http://localhost/api/v1/tools/create_transaction', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${generated.token}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify({ type: 'expense', amount: 10, confirm: true }),
    }), { params: Promise.resolve({ name: 'create_transaction' }) });
    const retry = await callTool(new NextRequest('http://localhost/api/v1/tools/create_transaction', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${generated.token}`,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify({ type: 'expense', amount: 10, confirm: true }),
    }), { params: Promise.resolve({ name: 'create_transaction' }) });
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    const ids = mocks.invoke.mock.calls.map((c: Array<{ requestId?: string }>) => c[0]?.requestId);
    expect(ids.filter((id: string | undefined) => id === key)).toHaveLength(2);
  });

  it('returns 429 (not 401) when the v1 GET bucket is exhausted', async () => {
    const generated = generatePersonalAccessToken();
    mocks.from.mockImplementation(() => chain({
      data: {
        id: 'pat-1', user_id: FIXTURE_USER, scopes: ['read'], token_hash: generated.hash,
        revoked_at: null, last_used_at: null, expires_at: '2099-01-01T00:00:00.000Z',
      },
      error: null,
    }));
    const spy = vi.spyOn(rateLimit, 'rateLimitAllow').mockReturnValue(false);
    const res = await listTools(new NextRequest('http://localhost/api/v1/tools', {
      headers: { authorization: `Bearer ${generated.token}` },
    }));
    spy.mockRestore();
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(String(body.error || '')).not.toMatch(/unauthorized/i);
  });
});
