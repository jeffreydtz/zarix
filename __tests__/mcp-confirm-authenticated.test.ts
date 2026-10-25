import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const FIXTURE_A = '11111111-1111-4111-8111-111111111111';
const FIXTURE_B = '22222222-2222-4222-8222-222222222222';
const PENDING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';
const PENDING_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9';
const ACCOUNT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const ACCOUNT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const CLAIM_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  create: vi.fn(),
  peek: vi.fn(),
  listAccounts: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClientSync: () => ({ from: mocks.from, rpc: mocks.rpc }),
  createBareServiceClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));

vi.mock('@/lib/ai/registry/context', () => ({
  loadRegistryFinancialContext: async (userId: string) => ({
    user: { id: userId, default_currency: 'ARS' },
    accounts: [
      {
        id: userId === FIXTURE_B ? ACCOUNT_B : ACCOUNT_A,
        user_id: userId,
        name: 'Visa Ejemplo',
        currency: 'ARS',
        type: 'credit_card',
        is_active: true,
        is_multicurrency: false,
      },
    ],
    categories: [],
  }),
}));

vi.mock('@/lib/supabase/request-scope', () => ({
  withPatUserScope: (_userId: string, work: () => Promise<unknown>) => work(),
}));

vi.mock('@/lib/services/accounts', () => ({
  accountsService: { list: (...args: unknown[]) => mocks.listAccounts(...args) },
}));

vi.mock('@/lib/services/transactions', () => ({
  transactionsService: {
    create: (...args: unknown[]) => mocks.create(...args),
    peekDurableRequest: (...args: unknown[]) => mocks.peek(...args),
  },
}));

import { generatePersonalAccessToken } from '@/lib/auth/personal-access-token';
import { POST as callTool } from '@/app/api/v1/tools/[name]/route';
import { invokeRegistryForPat } from '@/lib/integrations/invoke-registry';

type InboxStatus = 'pending' | 'confirming' | 'confirmed' | 'discarded' | 'uncertain';

function itemRow(userId: string, itemId: string, status: InboxStatus, accountId: string) {
  return {
    id: itemId,
    user_id: userId,
    amount: 18,
    currency: 'ARS',
    merchant: userId === FIXTURE_A ? 'MCP Café' : 'MCP B',
    card_name: 'Visa Ejemplo',
    account_id: accountId,
    category_id: null,
    occurred_at: '2026-10-24T15:00:00.000Z',
    tool_payload: { type: 'expense', amount: 18, accountId, _tool: 'create_transaction' },
    status,
    direction: 'expense',
    amount_ambiguous: false,
    ingest_key: `wallet:${itemId}`,
    idempotency_key: null,
    source: 'mcp',
    raw_text: null,
    created_at: '2026-10-24T15:00:00.000Z',
    claim_id: status === 'confirming' ? CLAIM_ID : null,
  };
}

function patChain(result: unknown) {
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

function inboxFrom(ownerId: string, callerId: string, itemId: string) {
  let status: InboxStatus = 'pending';
  const accountId = ownerId === FIXTURE_B ? ACCOUNT_B : ACCOUNT_A;
  mocks.rpc.mockImplementation(async (fn: string, args?: { p_user_id?: string; p_item_id?: string }) => {
    if (fn === 'rate_limit_hit') return { data: true, error: null };
    if (fn !== 'claim_pending_inbox_item') return { data: null, error: null };
    if (args?.p_user_id !== ownerId || args?.p_item_id !== itemId) return { data: [], error: null };
    if (status !== 'pending' && status !== 'uncertain') return { data: [], error: null };
    status = 'confirming';
    return { data: [itemRow(ownerId, itemId, 'confirming', accountId)], error: null };
  });
  mocks.from.mockImplementation((table: string) => {
    const q: Record<string, unknown> = {};
    const self = q;
    q.select = () => self;
    q.eq = () => self;
    q.in = () => self;
    q.is = () => self;
    q.or = () => self;
    q.update = (value: Record<string, unknown>) => {
      if (table === 'pending_inbox_items' && value.status === 'confirmed') status = 'confirmed';
      return self;
    };
    q.maybeSingle = async () => {
      if (table === 'transaction_requests') return { data: null, error: null };
      if (table === 'personal_access_tokens') return { data: null, error: null };
      if (table === 'pending_inbox_items') {
        if (callerId !== ownerId) return { data: null, error: null };
        return { data: itemRow(ownerId, itemId, status, accountId), error: null };
      }
      return { data: null, error: null };
    };
    q.single = async () => ({
      data: table === 'users' ? { id: callerId, default_currency: 'ARS' } : itemRow(ownerId, itemId, status, accountId),
      error: null,
    });
    q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
    q.upsert = async () => ({ data: null, error: null });
    q.insert = async () => ({ error: null });
    q.order = () => self;
    return q;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.peek.mockResolvedValue(null);
  mocks.create.mockImplementation(async (input: { userId: string; amount: number; currency: string }) => ({
    id: `tx-${input.userId.slice(0, 8)}`,
    amount: input.amount,
    currency: input.currency,
  }));
  mocks.listAccounts.mockImplementation(async (userId: string) => [
    {
      id: userId === FIXTURE_B ? ACCOUNT_B : ACCOUNT_A,
      name: 'Visa Ejemplo',
      currency: 'ARS',
      type: 'credit_card',
    },
  ]);
  mocks.rpc.mockResolvedValue({ data: true, error: null });
});

describe('authenticated MCP/REST confirm (real confirmPendingItem + ledger create)', () => {
  it('confirms a parked write with {confirm, pendingId} and writes one ledger row', async () => {
    inboxFrom(FIXTURE_A, FIXTURE_A, PENDING_ID);
    const result = await invokeRegistryForPat({
      userId: FIXTURE_A,
      scopes: ['read', 'write', 'write:confirm'],
      name: 'create_transaction',
      args: { confirm: true, pendingId: PENDING_ID },
      source: 'mcp',
    });
    expect(result.response.success).toBe(true);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      userId: FIXTURE_A,
      amount: 18,
      source: 'mcp',
    });
    expect(JSON.stringify(result)).not.toContain(FIXTURE_B);
  });

  it('isolates confirm to the PAT user across two fixture accounts', async () => {
    inboxFrom(FIXTURE_A, FIXTURE_B, PENDING_ID);
    await expect(
      invokeRegistryForPat({
        userId: FIXTURE_B,
        scopes: ['read', 'write', 'write:confirm'],
        name: 'create_transaction',
        args: { confirm: true, pendingId: PENDING_ID },
        source: 'mcp',
      })
    ).rejects.toMatchObject({ status: 404 });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('walks the REST PAT route for a successful confirm', async () => {
    const generated = generatePersonalAccessToken();
    let status: InboxStatus = 'pending';
    mocks.from.mockImplementation((table: string) => {
      if (table === 'personal_access_tokens') {
        return patChain({
          data: {
            id: 'pat-a',
            user_id: FIXTURE_A,
            scopes: ['read', 'write', 'write:confirm'],
            token_hash: generated.hash,
            hash_version: 1,
            revoked_at: null,
            last_used_at: null,
            expires_at: '2099-01-01T00:00:00.000Z',
          },
          error: null,
        });
      }
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.in = () => self;
      q.is = () => self;
      q.or = () => self;
      q.update = (value: Record<string, unknown>) => {
        if (table === 'pending_inbox_items' && value.status === 'confirmed') status = 'confirmed';
        return self;
      };
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') return { data: null, error: null };
        if (table === 'pending_inbox_items') {
          return { data: itemRow(FIXTURE_A, PENDING_ID, status, ACCOUNT_A), error: null };
        }
        return { data: null, error: null };
      };
      q.single = async () => ({ data: { id: FIXTURE_A, default_currency: 'ARS' }, error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      q.insert = async () => ({ error: null });
      q.order = () => self;
      return q;
    });
    mocks.rpc.mockImplementation(async (fn: string, args?: { p_user_id?: string; p_item_id?: string }) => {
      if (fn === 'rate_limit_hit') return { data: true, error: null };
      if (fn === 'claim_pending_inbox_item' && args?.p_user_id === FIXTURE_A && args?.p_item_id === PENDING_ID) {
        status = 'confirming';
        return { data: [itemRow(FIXTURE_A, PENDING_ID, 'confirming', ACCOUNT_A)], error: null };
      }
      return { data: [], error: null };
    });
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
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][0].userId).toBe(FIXTURE_A);
  });

  it('does not let fixture B confirm fixture A pending over REST', async () => {
    const generated = generatePersonalAccessToken();
    mocks.from.mockImplementation((table: string) => {
      if (table === 'personal_access_tokens') {
        return patChain({
          data: {
            id: 'pat-b',
            user_id: FIXTURE_B,
            scopes: ['read', 'write', 'write:confirm'],
            token_hash: generated.hash,
            hash_version: 1,
            revoked_at: null,
            last_used_at: null,
            expires_at: '2099-01-01T00:00:00.000Z',
          },
          error: null,
        });
      }
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.in = () => self;
      q.is = () => self;
      q.or = () => self;
      q.update = () => self;
      q.maybeSingle = async () => ({ data: null, error: null });
      q.single = async () => ({ data: { id: FIXTURE_B, default_currency: 'ARS' }, error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      q.insert = async () => ({ error: null });
      q.order = () => self;
      return q;
    });
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'rate_limit_hit') return { data: true, error: null };
      return { data: [], error: null };
    });
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
    expect(mocks.create).not.toHaveBeenCalled();
    expect(JSON.stringify(await res.clone().json().catch(() => ({})))).not.toContain(PENDING_B);
  });
});
