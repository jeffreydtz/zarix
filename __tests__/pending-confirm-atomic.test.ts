import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pendingInboxRequestId, walletCivilDate } from '@/lib/services/pending-inbox';
import { validTransactionRequestId } from '@/lib/transaction-idempotency';

const FIXTURE_ITEM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';
const FIXTURE_USER = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const CATEGORY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  execute: vi.fn(),
  listAccounts: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClientSync: () => ({ rpc: mocks.rpc, from: mocks.from }),
  createBareServiceClient: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

vi.mock('@/lib/supabase/request-scope', () => ({
  withPatUserScope: (_userId: string, work: () => Promise<unknown>) => work(),
}));

vi.mock('@/lib/ai/registry/execute', () => ({
  executeRegistryTool: (...args: unknown[]) => mocks.execute(...args),
}));

vi.mock('@/lib/services/accounts', () => ({
  accountsService: { list: (...args: unknown[]) => mocks.listAccounts(...args) },
}));

import { confirmPendingItem } from '@/lib/services/pending-inbox';

function itemRow(status: string) {
  return {
    id: FIXTURE_ITEM,
    user_id: FIXTURE_USER,
    amount: 1250,
    currency: 'ARS',
    merchant: 'Ejemplo Café',
    card_name: 'Visa Ejemplo',
    account_id: ACCOUNT_ID,
    category_id: CATEGORY_ID,
    occurred_at: '2026-10-24T23:30:00.000Z',
    status,
    direction: 'expense',
    amount_ambiguous: false,
    ingest_key: `wallet:${FIXTURE_ITEM}`,
    idempotency_key: null,
    source: 'wallet',
    raw_text: null,
    created_at: '2026-10-24T20:00:00.000Z',
  };
}

describe('pending inbox confirm idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAccounts.mockResolvedValue([{ id: ACCOUNT_ID, name: 'Visa Ejemplo', currency: 'ARS' }]);
    mocks.execute.mockResolvedValue({
      response: { success: true },
      executed: [{ id: 'tx-1' }],
    });
  });

  it('derives a durable request id from the pending item, never a real user id', () => {
    const key = pendingInboxRequestId(FIXTURE_ITEM);
    expect(key).toBe(`wallet:${FIXTURE_ITEM}`);
    expect(validTransactionRequestId(key)).toBe(true);
    expect(key).not.toMatch(/hotmail/i);
    expect(key).not.toContain(FIXTURE_USER);
  });

  it('uses America/Argentina/Cordoba for wallet calendar dates', () => {
    expect(walletCivilDate('2026-10-24T23:30:00.000Z')).toBe('2026-10-24');
    expect(walletCivilDate('2026-10-25T02:30:00.000Z')).toBe('2026-10-24');
  });

  it('two parallel confirms plus a retry create a single ledger write', async () => {
    let status = 'pending';
    let createCalls = 0;
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn !== 'claim_pending_inbox_item') return { data: null, error: null };
      if (status === 'pending') {
        status = 'confirming';
        return { data: [itemRow('confirming')], error: null };
      }
      return { data: [], error: null };
    });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.in = () => self;
      q.update = () => self;
      q.maybeSingle = async () => ({
        data: table === 'pending_inbox_items' ? itemRow(status === 'confirming' ? 'confirmed' : status) : null,
        error: null,
      });
      q.single = async () => ({ data: itemRow(status), error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    mocks.execute.mockImplementation(async () => {
      createCalls += 1;
      status = 'confirmed';
      return { response: { success: true }, executed: [{ id: 'tx-1' }] };
    });

    const [a, b] = await Promise.all([
      confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM }),
      confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM }),
    ]);
    const retry = await confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM });

    expect(createCalls).toBeGreaterThanOrEqual(1);
    expect(createCalls).toBeLessThanOrEqual(2);
    expect(a.id).toBe(FIXTURE_ITEM);
    expect(b.id).toBe(FIXTURE_ITEM);
    expect(retry.id).toBe(FIXTURE_ITEM);
    const ids = mocks.execute.mock.calls.map((call: unknown[]) => (call[2] as { requestId: string }).requestId);
    expect(new Set(ids)).toEqual(new Set([`wallet:${FIXTURE_ITEM}`]));
    expect(mocks.execute.mock.calls[0][1]).toMatchObject({
      accountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      confirm: true,
    });
  });
});
