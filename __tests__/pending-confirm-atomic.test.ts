import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  confirmPendingItem,
  isStaleConfirming,
  listPendingItems,
  occurredAtForStorage,
  parkRegistryWrite,
  pendingInboxRequestId,
  walletCivilDate,
  type PendingInboxItem,
} from '@/lib/services/pending-inbox';
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

vi.mock('@/lib/integrations/merchant-category', () => ({
  suggestCategoryFromMerchant: async () => ({ categoryId: null, categoryName: null, source: 'none' }),
}));

const updates: Array<{ table: string; value: Record<string, unknown> }> = [];

const CLAIM_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const SYSTEM_CATEGORY_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';

function itemRow(status: PendingInboxItem['status'], extras: Partial<PendingInboxItem> = {}) {
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
    tool_payload: null,
    updated_at: '2026-10-24T20:00:00.000Z',
    status,
    direction: 'expense',
    amount_ambiguous: false,
    ingest_key: `wallet:${FIXTURE_ITEM}`,
    idempotency_key: null,
    source: 'wallet',
    raw_text: null,
    created_at: '2026-10-24T20:00:00.000Z',
    claim_id: status === 'confirming' ? CLAIM_ID : null,
    ...extras,
  };
}

describe('pending inbox confirm idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
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

  it('two parallel confirms plus a retry create a single ledger write; CAS loser 409s', async () => {
    let status: PendingInboxItem['status'] = 'pending';
    let createCalls = 0;
    let resumeExecute: () => void = () => {};
    const executeGate = new Promise<void>((resolve) => {
      resumeExecute = resolve;
    });
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
      q.is = () => self;
      q.or = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table, value });
        if (table === 'pending_inbox_items' && value.status === 'confirmed') status = 'confirmed';
        return self;
      };
      q.maybeSingle = async () => ({
        data: table === 'pending_inbox_items' ? itemRow(status) : null,
        error: null,
      });
      q.single = async () => ({ data: itemRow(status), error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    mocks.execute.mockImplementation(async () => {
      await executeGate;
      createCalls += 1;
      status = 'confirmed';
      return { response: { success: true }, executed: [{ id: 'tx-1' }] };
    });

    const winner = confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM });
    await vi.waitFor(() => expect(mocks.execute).toHaveBeenCalledTimes(1));
    await expect(confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM })).rejects.toMatchObject({
      status: 409,
    });
    expect(createCalls).toBe(0);
    resumeExecute();
    const a = await winner;
    expect(createCalls).toBe(1);
    const retry = await confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM });

    expect(a.id).toBe(FIXTURE_ITEM);
    expect(retry.id).toBe(FIXTURE_ITEM);
    const ids = mocks.execute.mock.calls.map((call: unknown[]) => (call[2] as { requestId: string }).requestId);
    expect(new Set(ids)).toEqual(new Set([`wallet:${FIXTURE_ITEM}`]));
    expect(mocks.execute.mock.calls[0][1]).toMatchObject({
      accountId: ACCOUNT_ID,
      categoryId: CATEGORY_ID,
      confirm: true,
    });
  });

  it('reverts confirming if the ledger write throws', async () => {
    const eqs: Array<[string, unknown]> = [];
    mocks.rpc.mockResolvedValue({ data: [itemRow('confirming')], error: null });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = (column: string, value: unknown) => {
        eqs.push([column, value]);
        return self;
      };
      q.in = () => self;
      q.is = () => self;
      q.or = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table, value });
        return self;
      };
      q.maybeSingle = async () => ({ data: itemRow('confirming'), error: null });
      q.single = async () => ({ data: itemRow('confirming'), error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    mocks.execute.mockRejectedValue(new Error('ledger exploded'));

    await expect(confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM })).rejects.toThrow('ledger exploded');
    expect(updates.some((u) => u.table === 'pending_inbox_items' && u.value.status === 'pending')).toBe(true);
    expect(eqs).toContainEqual(['claim_id', CLAIM_ID]);
  });

  it('lists stale confirming items as retryable', async () => {
    const stale = {
      ...itemRow('confirming'),
      updated_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    };
    const fresh = {
      ...itemRow('confirming'),
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9',
      updated_at: new Date().toISOString(),
    };
    const pending = itemRow('pending');
    mocks.from.mockImplementation(() => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.in = () => self;
      q.order = () => self;
      q.limit = () => self;
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [stale, fresh, pending], error: null });
      return q;
    });
    const listed = await listPendingItems(FIXTURE_USER, 'pending');
    expect(listed.map((i) => i.id)).toEqual([stale.id, pending.id]);
    expect(isStaleConfirming(stale)).toBe(true);
    expect(isStaleConfirming(fresh)).toBe(false);
  });

  it('fingerprint unique conflict returns the existing pending item', async () => {
    const existing = itemRow('pending');
    let insertCalls = 0;
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.in = () => self;
      q.gte = () => self;
      q.limit = () => self;
      q.order = () => self;
      q.insert = () => {
        insertCalls += 1;
        return self;
      };
      q.maybeSingle = async () => ({
        data: table === 'pending_inbox_items' ? existing : null,
        error: null,
      });
      q.single = async () => ({
        data: null,
        error: { code: '23505', message: 'duplicate key value violates unique constraint' },
      });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    const { ingestWalletItem } = await import('@/lib/services/pending-inbox');
    const result = await ingestWalletItem({
      userId: FIXTURE_USER,
      json: { amount: 1250, currency: 'ARS', merchant: 'Ejemplo Café' },
    });
    expect(result.duplicate).toBe(true);
    expect(result.item.id).toBe(FIXTURE_ITEM);
    expect(insertCalls).toBeGreaterThan(0);
  });

  it('reusing a wallet Idempotency-Key with a different body returns 409', async () => {
    const existing = {
      ...itemRow('pending'),
      ingest_key: 'wallet-idem-fixture-009',
      fingerprint: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    };
    mocks.from.mockImplementation(() => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.maybeSingle = async () => ({ data: existing, error: null });
      q.insert = () => self;
      q.single = async () => ({ data: existing, error: null });
      return q;
    });
    const { ingestWalletItem } = await import('@/lib/services/pending-inbox');
    await expect(
      ingestWalletItem({
        userId: FIXTURE_USER,
        json: { amount: 999, currency: 'USD', merchant: 'Otro' },
        idempotencyKey: 'wallet-idem-fixture-009',
      })
    ).rejects.toMatchObject({ status: 409 });
  });

  it('parks the full payload for income, transfer and expense and stores Cordoba noon for date-only', async () => {
    const inserted: Record<string, unknown>[] = [];
    mocks.from.mockImplementation(() => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.insert = (row: Record<string, unknown>) => {
        inserted.push(row);
        return self;
      };
      q.maybeSingle = async () => ({ data: null, error: null });
      q.single = async () => ({
        data: { ...inserted[inserted.length - 1], id: `park-${inserted.length}`, status: 'pending' },
        error: null,
      });
      return q;
    });

    await parkRegistryWrite({
      userId: FIXTURE_USER,
      amount: 1000,
      currency: 'ARS',
      merchant: 'Sueldo',
      source: 'api',
      occurredAt: '2026-10-24',
      toolPayload: { type: 'income', amount: 1000, account: 'Banco', accountId: ACCOUNT_ID, description: 'Sueldo' },
    });
    await parkRegistryWrite({
      userId: FIXTURE_USER,
      amount: 500,
      currency: 'ARS',
      source: 'mcp',
      toolPayload: {
        type: 'transfer',
        amount: 500,
        account: 'Banco',
        destinationAccount: 'Efectivo',
        accountId: ACCOUNT_ID,
      },
    });
    await parkRegistryWrite({
      userId: FIXTURE_USER,
      amount: 250,
      currency: 'ARS',
      source: 'api',
      toolPayload: { type: 'expense', amount: 250, category: 'Comida', accountId: ACCOUNT_ID },
    });

    expect(inserted[0].direction).toBe('income');
    expect(inserted[0].occurred_at).toBe('2026-10-24T12:00:00-03:00');
    expect((inserted[0].tool_payload as { type: string }).type).toBe('income');
    expect((inserted[1].tool_payload as { destinationAccount: string }).destinationAccount).toBe('Efectivo');
    expect((inserted[1].tool_payload as { type: string }).type).toBe('transfer');
    expect((inserted[2].tool_payload as { type: string }).type).toBe('expense');
    expect(occurredAtForStorage('2026-10-24')).toBe('2026-10-24T12:00:00-03:00');
    expect(walletCivilDate(occurredAtForStorage('2026-10-24'))).toBe('2026-10-24');
  });

  it('confirm resolves a NULL-owner system category on the create_transaction path', async () => {
    const parked = itemRow('confirming', {
      category_id: SYSTEM_CATEGORY_ID,
      tool_payload: {
        type: 'expense',
        amount: 1250,
        accountId: ACCOUNT_ID,
        categoryId: SYSTEM_CATEGORY_ID,
        category: 'Comida',
      },
    });
    mocks.rpc.mockResolvedValue({ data: [parked], error: null });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.in = () => self;
      q.is = () => self;
      q.or = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table, value });
        return self;
      };
      q.maybeSingle = async () => ({
        data: table === 'pending_inbox_items' ? { ...parked, status: 'confirmed' } : null,
        error: null,
      });
      q.single = async () => ({
        data:
          table === 'users'
            ? { id: FIXTURE_USER, default_currency: 'ARS' }
            : parked,
        error: null,
      });
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data:
            table === 'categories'
              ? [
                  {
                    id: SYSTEM_CATEGORY_ID,
                    user_id: null,
                    name: 'Comida',
                    type: 'expense',
                    icon: '🍔',
                    is_system: true,
                  },
                ]
              : [],
          error: null,
        });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    await confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM });
    expect(mocks.execute.mock.calls[0][1]).toMatchObject({
      categoryId: SYSTEM_CATEGORY_ID,
      confirm: true,
    });
    expect(mocks.execute.mock.calls[0][2]).toMatchObject({
      financialContext: {
        categories: [expect.objectContaining({ id: SYSTEM_CATEGORY_ID, user_id: null, is_system: true })],
      },
    });
  });

  it('reusing an ingest key with a different body returns 409', async () => {
    const existing = {
      ...itemRow('pending'),
      ingest_key: 'idem-park-fixture-009',
      tool_payload: { type: 'expense', amount: 10, description: 'Café', _tool: 'create_transaction' },
    };
    mocks.from.mockImplementation(() => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.maybeSingle = async () => ({ data: existing, error: null });
      q.insert = () => self;
      q.single = async () => ({ data: existing, error: null });
      return q;
    });
    await expect(
      parkRegistryWrite({
        userId: FIXTURE_USER,
        amount: 99,
        currency: 'ARS',
        merchant: 'Otro',
        source: 'api',
        ingestKey: 'idem-park-fixture-009',
        toolPayload: { type: 'expense', amount: 99, description: 'Otro', _tool: 'create_transaction' },
      })
    ).rejects.toMatchObject({ status: 409 });

    const replay = await parkRegistryWrite({
      userId: FIXTURE_USER,
      amount: 10,
      currency: 'ARS',
      merchant: 'Café',
      source: 'api',
      ingestKey: 'idem-park-fixture-009',
      toolPayload: { type: 'expense', amount: 10, description: 'Café', _tool: 'create_transaction' },
    });
    expect(replay.id).toBe(existing.id);
  });

  it('confirm uses the parked type, not a hardcoded expense', async () => {
    const parked = {
      ...itemRow('confirming'),
      direction: 'expense',
      tool_payload: {
        type: 'income',
        amount: 1000,
        accountId: ACCOUNT_ID,
        account: 'Visa Ejemplo',
        description: 'Sueldo',
      },
    };
    mocks.rpc.mockResolvedValue({ data: [parked], error: null });
    mocks.from.mockImplementation(() => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.or = () => self;
      q.is = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table: 'pending_inbox_items', value });
        return self;
      };
      q.maybeSingle = async () => ({ data: { ...parked, status: 'confirmed' }, error: null });
      q.single = async () => ({ data: parked, error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    await confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM });
    expect(mocks.execute.mock.calls[0][0]).toBe('create_transaction');
    expect(mocks.execute.mock.calls[0][1]).toMatchObject({ type: 'income', confirm: true });
  });

  it('confirm uses parked transfer destination and dispatches parked _tool for delete', async () => {
    const transfer = {
      ...itemRow('confirming'),
      tool_payload: {
        _tool: 'create_transaction',
        type: 'transfer',
        amount: 500,
        account: 'Banco',
        destinationAccount: 'Efectivo',
        accountId: ACCOUNT_ID,
      },
    };
    mocks.rpc.mockResolvedValue({ data: [transfer], error: null });
    mocks.from.mockImplementation(() => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table: 'pending_inbox_items', value });
        return self;
      };
      q.maybeSingle = async () => ({ data: { ...transfer, status: 'confirmed' }, error: null });
      q.single = async () => ({ data: transfer, error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    await confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM });
    expect(mocks.execute.mock.calls[0][1]).toMatchObject({
      type: 'transfer',
      destinationAccount: 'Efectivo',
      confirm: true,
    });

    mocks.execute.mockClear();
    const deleted = {
      ...itemRow('confirming'),
      amount: null,
      tool_payload: {
        _tool: 'delete_last_transaction',
        transactionId: 'tx-preview',
        type: 'expense',
        amount: 10,
        description: 'Café',
      },
    };
    mocks.rpc.mockResolvedValue({ data: [deleted], error: null });
    mocks.from.mockImplementation(() => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table: 'pending_inbox_items', value });
        return self;
      };
      q.maybeSingle = async () => ({ data: { ...deleted, status: 'confirmed' }, error: null });
      q.single = async () => ({ data: deleted, error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    await confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM });
    expect(mocks.execute.mock.calls[0][0]).toBe('delete_last_transaction');
    expect(mocks.execute.mock.calls[0][1]).toMatchObject({
      transactionId: 'tx-preview',
      confirm: true,
    });
  });
});
