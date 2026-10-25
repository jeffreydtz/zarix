import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const FIXTURE_A = '11111111-1111-4111-8111-111111111111';
const FIXTURE_B = '22222222-2222-4222-8222-222222222222';
const PENDING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';
const PENDING_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  confirm: vi.fn(),
  confirmMany: vi.fn(),
  park: vi.fn(),
  executeBot: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClientSync: () => ({ from: mocks.from, rpc: mocks.rpc }),
  createBareServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

vi.mock('@/lib/ai/registry/context', () => ({
  loadRegistryFinancialContext: async () => ({
    user: { default_currency: 'ARS' },
    accounts: [],
    categories: [],
  }),
}));

vi.mock('@/lib/supabase/request-scope', () => ({
  withPatUserScope: (_userId: string, work: () => Promise<unknown>) => work(),
}));

vi.mock('@/lib/services/pending-inbox', () => ({
  confirmPendingItem: (input: Record<string, unknown>) => mocks.confirm(input),
  confirmPendingItems: (input: Record<string, unknown>) => mocks.confirmMany(input),
  parkRegistryWrite: (input: Record<string, unknown>) => mocks.park(input),
}));

vi.mock('@/lib/telegram/executeBotTransaction', () => ({
  executeBotTransaction: (...args: unknown[]) => mocks.executeBot(...args),
}));

import { generatePersonalAccessToken } from '@/lib/auth/personal-access-token';
import { POST as callTool } from '@/app/api/v1/tools/[name]/route';
import { invokeRegistryForPat } from '@/lib/integrations/invoke-registry';
import { ApiError } from '@/lib/api-handler';

function chain(result: unknown) {
  const q: Record<string, unknown> = {};
  const self = q;
  q.select = () => self;
  q.eq = () => self;
  q.is = () => self;
  q.order = () => self;
  q.update = () => self;
  q.insert = async () => ({ error: null });
  q.maybeSingle = async () => result;
  q.single = async () => result;
  return q;
}

function patRow(userId: string, tokenHash: string, scopes: string[]) {
  return {
    data: {
      id: `pat-${userId.slice(0, 8)}`,
      user_id: userId,
      scopes,
      token_hash: tokenHash,
      hash_version: 1,
      revoked_at: null,
      last_used_at: null,
      expires_at: '2099-01-01T00:00:00.000Z',
    },
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.park.mockResolvedValue({ id: PENDING_ID });
  mocks.confirm.mockImplementation(async (input: { userId: string; itemId: string }) => {
    if (input.userId !== FIXTURE_A) {
      throw new ApiError('Pendiente no encontrado.', 404);
    }
    return { id: input.itemId, merchant: 'Café', status: 'confirmed' };
  });
  mocks.confirmMany.mockResolvedValue([{ id: PENDING_ID }]);
});

describe('authenticated MCP/REST confirm (real invokeRegistryForPat)', () => {
  it('confirms a parked write with {confirm, pendingId} and does not write a second ledger row', async () => {
    const generated = generatePersonalAccessToken();
    mocks.from.mockImplementation(() =>
      chain(patRow(FIXTURE_A, generated.hash, ['read', 'write', 'write:confirm']))
    );

    const result = await invokeRegistryForPat({
      userId: FIXTURE_A,
      scopes: ['read', 'write', 'write:confirm'],
      name: 'create_transaction',
      args: { confirm: true, pendingId: PENDING_ID },
      source: 'mcp',
    });

    expect(result.response.success).toBe(true);
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ userId: FIXTURE_A, itemId: PENDING_ID })
    );
    expect(mocks.executeBot).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(FIXTURE_B);
  });

  it('isolates confirm to the PAT user across two fixture accounts', async () => {
    await expect(
      invokeRegistryForPat({
        userId: FIXTURE_B,
        scopes: ['read', 'write', 'write:confirm'],
        name: 'create_transaction',
        args: { confirm: true, pendingId: PENDING_ID },
        source: 'mcp',
      })
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.confirm.mock.calls[0][0].userId).toBe(FIXTURE_B);
    expect(mocks.confirm.mock.calls[0][0].userId).not.toBe(FIXTURE_A);
    expect(mocks.executeBot).not.toHaveBeenCalled();
  });

  it('walks the REST PAT route for a successful confirm', async () => {
    const generated = generatePersonalAccessToken();
    mocks.from.mockImplementation(() =>
      chain(patRow(FIXTURE_A, generated.hash, ['read', 'write', 'write:confirm']))
    );
    const res = await callTool(
      new NextRequest('http://localhost/api/v1/tools/create_transaction', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${generated.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ confirm: true, pendingId: PENDING_ID }),
      }),
      { params: Promise.resolve({ name: 'create_transaction' }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ userId: FIXTURE_A, itemId: PENDING_ID })
    );
    expect(mocks.executeBot).not.toHaveBeenCalled();
  });

  it('does not let fixture B confirm fixture A pending over REST', async () => {
    const generated = generatePersonalAccessToken();
    mocks.from.mockImplementation(() =>
      chain(patRow(FIXTURE_B, generated.hash, ['read', 'write', 'write:confirm']))
    );
    const res = await callTool(
      new NextRequest('http://localhost/api/v1/tools/create_transaction', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${generated.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ confirm: true, pendingId: PENDING_ID }),
      }),
      { params: Promise.resolve({ name: 'create_transaction' }) }
    );
    expect(res.status).toBe(404);
    expect(mocks.confirm.mock.calls[0][0].userId).toBe(FIXTURE_B);
    expect(mocks.executeBot).not.toHaveBeenCalled();
    expect(JSON.stringify(await res.clone().json().catch(() => ({})))).not.toContain(PENDING_B);
  });
});
