import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canonicalInboxPayloadKey,
  canonicalPendingInboxId,
  canonicalPendingInboxIds,
  confirmPendingItem,
  confirmPendingItems,
  discardPendingItem,
  hasStableInboxIdentity,
  inboxDedupeLockKey,
  inboxEventFingerprint,
  inboxRequestCanonical,
  INBOX_DEDUPE_WINDOW_MS,
  isFullOccurredAt,
  isStaleConfirming,
  listPendingItems,
  occurredAtForStorage,
  parkRegistryWrite,
  pendingInboxRequestId,
  walletCivilDate,
  type PendingInboxItem,
} from '@/lib/services/pending-inbox';
import { FxUnavailableError } from '@/lib/executable-fx';
import { validTransactionRequestId } from '@/lib/transaction-idempotency';
import { AmbiguousFinancialMutationError } from '@/lib/financial-mutation-error';

const FIXTURE_ITEM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';
const FIXTURE_USER = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const CATEGORY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  execute: vi.fn(),
  listAccounts: vi.fn(),
  suggest: vi.fn(async (): Promise<{
    categoryId: string | null;
    categoryName: string | null;
    source: string;
  }> => ({ categoryId: null, categoryName: null, source: 'none' })),
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
  accountsService: {
    list: (...args: unknown[]) => mocks.listAccounts(...args),
    findByNameFuzzy: async () => ({ account: null, confidence: 'none' }),
  },
}));

vi.mock('@/lib/integrations/merchant-category', () => ({
  suggestCategoryFromMerchant: () => mocks.suggest(),
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
    mocks.suggest.mockResolvedValue({ categoryId: null, categoryName: null, source: 'none' });
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

  it('canonicalizes hyphenated UUIDs and rejects dashless or other formats', () => {
    expect(canonicalPendingInboxId(FIXTURE_ITEM.toUpperCase())).toBe(FIXTURE_ITEM);
    expect(pendingInboxRequestId(FIXTURE_ITEM.toUpperCase())).toBe(`wallet:${FIXTURE_ITEM}`);
    expect(() => canonicalPendingInboxId(FIXTURE_ITEM.replaceAll('-', ''))).toThrow(/inválido/);
    expect(() => canonicalPendingInboxId('not-a-uuid')).toThrow(/inválido/);
    expect(() => pendingInboxRequestId(FIXTURE_ITEM.replaceAll('-', ''))).toThrow(/inválido/);
  });

  it('confirm and discard derive lock/receipt ids from the canonical UUID', async () => {
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'claim_pending_inbox_item') return { data: [itemRow('confirming')], error: null };
      if (fn === 'discard_pending_inbox_item') return { data: [itemRow('discarded')], error: null };
      return { data: null, error: null };
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
        return self;
      };
      q.maybeSingle = async () => ({
        data: table === 'pending_inbox_items' ? itemRow('confirmed') : null,
        error: null,
      });
      q.single = async () => ({ data: itemRow('confirmed'), error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    await confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM.toUpperCase() });
    expect(mocks.rpc).toHaveBeenCalledWith('claim_pending_inbox_item', {
      p_user_id: FIXTURE_USER,
      p_item_id: FIXTURE_ITEM,
    });
    expect(mocks.execute.mock.calls[0][2]).toMatchObject({ requestId: `wallet:${FIXTURE_ITEM}` });
    await discardPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM.toUpperCase() });
    expect(mocks.rpc).toHaveBeenCalledWith('discard_pending_inbox_item', {
      p_user_id: FIXTURE_USER,
      p_item_id: FIXTURE_ITEM,
    });
    await expect(
      confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM.replaceAll('-', '') })
    ).rejects.toMatchObject({ status: 400 });
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

  it('anonymous ingest never returns duplicate:true and parks a possible duplicate', async () => {
    const existing = itemRow('pending', { possible_duplicate_of: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9' });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.maybeSingle = async () => {
        if (table === 'wallet_card_account_maps') return { data: { account_id: ACCOUNT_ID }, error: null };
        return { data: null, error: null };
      };
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'reserve_pending_inbox_item') {
        return { data: { item: existing, duplicate: false }, error: null };
      }
      return { data: null, error: null };
    });
    const { ingestWalletItem } = await import('@/lib/services/pending-inbox');
    const result = await ingestWalletItem({
      userId: FIXTURE_USER,
      json: { amount: 1250, currency: 'ARS', merchant: 'Ejemplo Café' },
    });
    expect(result.duplicate).toBe(false);
    expect(result.autoConfirmed).toBe(false);
    expect(result.item.possible_duplicate_of).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9');
    expect(mocks.rpc).toHaveBeenCalledWith(
      'reserve_pending_inbox_item',
      expect.objectContaining({
        p_lookback_ms: INBOX_DEDUPE_WINDOW_MS,
        p_client_keyed: false,
      })
    );
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty('p_fingerprints');
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty('p_fingerprint');
  });

  it('reusing a wallet Idempotency-Key with a different body returns 409', async () => {
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.maybeSingle = async () => {
        if (table === 'wallet_card_account_maps') return { data: { account_id: ACCOUNT_ID }, error: null };
        return { data: null, error: null };
      };
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Esa Idempotency-Key ya se usó con otro cuerpo.' },
    });
    const { ingestWalletItem } = await import('@/lib/services/pending-inbox');
    await expect(
      ingestWalletItem({
        userId: FIXTURE_USER,
        json: { amount: 999, currency: 'USD', merchant: 'Otro' },
        idempotencyKey: 'wallet-idem-fixture-009',
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'reserve_pending_inbox_item',
      expect.objectContaining({
        p_client_keyed: true,
        p_lock_key: 'idemp:wallet-idem-fixture-009',
      })
    );
  });

  it('parks the full payload for income, transfer and expense and stores Cordoba noon for date-only', async () => {
    const inserted: Record<string, unknown>[] = [];
    mocks.from.mockImplementation(() => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.maybeSingle = async () => ({ data: null, error: null });
      return q;
    });
    mocks.rpc.mockImplementation(async (fn: string, args: { p_row?: Record<string, unknown> }) => {
      if (fn !== 'reserve_pending_inbox_item' || !args.p_row) return { data: null, error: null };
      inserted.push(args.p_row);
      return {
        data: { item: { ...args.p_row, id: `park-${inserted.length}`, status: 'pending' }, duplicate: false },
        error: null,
      };
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
    expect(mocks.execute.mock.calls[0][1]).toMatchObject({ type: 'income', confirm: true });
  });

  it('fingerprints opposite directions as distinct events', () => {
    const base = {
      amount: 100,
      currency: 'ARS',
      merchant: 'COTO',
      cardName: 'Visa Ejemplo',
    };
    const at = '2026-10-24T15:00:00.000Z';
    const purchase = inboxEventFingerprint(FIXTURE_USER, { ...base, direction: 'expense' }, at, '');
    const refund = inboxEventFingerprint(FIXTURE_USER, { ...base, direction: 'income' }, at, '');
    const otherUser = inboxEventFingerprint('22222222-2222-4222-8222-222222222222', { ...base, direction: 'expense' }, at, '');
    expect(purchase).not.toBe(refund);
    expect(purchase).not.toBe(otherUser);
  });

  it('persists mcp as ledgerSource while confirm transport stays wallet', async () => {
    const parked = {
      ...itemRow('confirming'),
      source: 'mcp',
      tool_payload: { type: 'expense', amount: 50, accountId: ACCOUNT_ID },
    };
    mocks.rpc.mockResolvedValue({ data: [parked], error: null });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.or = () => self;
      q.is = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table, value });
        return self;
      };
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') return { data: null, error: null };
        return { data: { ...parked, status: 'confirmed' }, error: null };
      };
      q.single = async () => ({ data: parked, error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    await confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM, source: 'mcp' });
    expect(mocks.execute.mock.calls[0][2]).toMatchObject({
      source: 'wallet',
      ledgerSource: 'mcp',
    });
  });

  it('marks uncertain when inbox update fails after the ledger commit', async () => {
    mocks.rpc.mockResolvedValue({ data: [itemRow('confirming')], error: null });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.or = () => self;
      q.is = () => self;
      q.in = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table, value });
        return self;
      };
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') return { data: null, error: null };
        const last = updates[updates.length - 1];
        if (last?.value?.status === 'confirmed') {
          return { data: null, error: { message: 'inbox write failed' } };
        }
        return { data: itemRow('confirming'), error: null };
      };
      q.single = async () => ({ data: itemRow('confirming'), error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    await expect(confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM })).rejects.toThrow(/inbox write failed/);
    expect(updates.some((u) => u.value.status === 'uncertain')).toBe(true);
    expect(updates.some((u) => u.value.status === 'pending')).toBe(false);
  });

  it('refuses to discard an uncertain item that already has a ledger row', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Este pendiente ya tiene un movimiento. No se puede descartar.' },
    });
    await expect(discardPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM })).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/movimiento/i),
    });
    expect(mocks.rpc).toHaveBeenCalledWith('discard_pending_inbox_item', {
      p_user_id: FIXTURE_USER,
      p_item_id: FIXTURE_ITEM,
    });
  });

  it('refuses to discard a confirming item and never CAS-updates confirming from JS', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'Este pendiente se está confirmando.' },
    });
    await expect(discardPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM })).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/confirmando/i),
    });
    expect(updates.some((u) => u.value.status === 'discarded')).toBe(false);
  });

  it('propagates discard lookup failures instead of treating them as no ledger', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'could not connect to database' } });
    await expect(discardPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM })).rejects.toMatchObject({
      status: 409,
    });
    expect(updates.some((u) => u.value.status === 'discarded')).toBe(false);
  });

  it('propagates receipt lookup errors instead of treating them as no ledger', async () => {
    mocks.rpc.mockResolvedValue({ data: [itemRow('confirming')], error: null });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.or = () => self;
      q.is = () => self;
      q.in = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table, value });
        return self;
      };
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') {
          return { data: null, error: { message: 'receipt lookup failed' } };
        }
        return { data: itemRow('confirming'), error: null };
      };
      q.single = async () => ({ data: itemRow('confirming'), error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    await expect(confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM })).rejects.toThrow(
      'receipt lookup failed'
    );
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('marks uncertain when the ledger response is lost after a possible commit', async () => {
    mocks.rpc.mockResolvedValue({ data: [itemRow('confirming')], error: null });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.or = () => self;
      q.is = () => self;
      q.in = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table, value });
        return self;
      };
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') return { data: null, error: null };
        return { data: itemRow('confirming'), error: null };
      };
      q.single = async () => ({ data: itemRow('confirming'), error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    mocks.execute.mockRejectedValue(new AmbiguousFinancialMutationError(new Error('lost ledger response')));
    await expect(confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM })).rejects.toBeInstanceOf(
      AmbiguousFinancialMutationError
    );
    expect(updates.some((u) => u.value.status === 'uncertain')).toBe(true);
    expect(updates.some((u) => u.value.status === 'pending')).toBe(false);
  });

  it('explicit null amount does not restore the parked or original amount', async () => {
    const parked = itemRow('confirming', {
      amount: 1250,
      tool_payload: { type: 'expense', amount: 999, accountId: ACCOUNT_ID },
    });
    mocks.rpc.mockResolvedValue({ data: [parked], error: null });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.or = () => self;
      q.is = () => self;
      q.in = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table, value });
        return self;
      };
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') return { data: null, error: null };
        return { data: parked, error: null };
      };
      q.single = async () => ({ data: parked, error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    await expect(
      confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM, amount: null })
    ).rejects.toMatchObject({ message: expect.stringMatching(/Falta el monto/) });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('keyed fingerprints ignore receive day; anonymous identity is never auto-confirmed without a timestamp or key', () => {
    const base = {
      amount: 40,
      currency: 'ARS',
      merchant: 'Café',
      cardName: 'Visa',
      direction: 'expense' as const,
    };
    const keyed = inboxEventFingerprint(FIXTURE_USER, base, null, 'wallet-idem-fixture-009');
    const keyedLater = inboxEventFingerprint(FIXTURE_USER, base, '2026-10-25T23:00:00.000Z', 'wallet-idem-fixture-009');
    expect(keyed).toBe(keyedLater);
    expect(hasStableInboxIdentity(null, '')).toBe(false);
    expect(hasStableInboxIdentity('2026-10-24', '')).toBe(false);
    expect(isFullOccurredAt('2026-10-24')).toBe(false);
    expect(hasStableInboxIdentity(null, 'wallet-idem-fixture-009')).toBe(true);
    expect(hasStableInboxIdentity('2026-10-25T13:14:50.000Z', '')).toBe(true);
    expect(inboxDedupeLockKey(FIXTURE_USER, base, '')).toBe(inboxDedupeLockKey(FIXTURE_USER, base, ''));
    expect(inboxDedupeLockKey(FIXTURE_USER, base, '')).toBe(
      inboxDedupeLockKey(FIXTURE_USER, { ...base, merchant: 'Otro', cardName: 'Mastercard' }, '')
    );
    expect(inboxDedupeLockKey(FIXTURE_USER, base, '')).not.toBe(
      inboxDedupeLockKey(FIXTURE_USER, { ...base, amount: 41 }, '')
    );
    expect(inboxDedupeLockKey(FIXTURE_USER, base, 'wallet-idem-fixture-009')).toBe(
      'idemp:wallet-idem-fixture-009'
    );
  });

  it('reuses an Idempotency-Key across midnight when the canonical payload matches', async () => {
    const existing = itemRow('pending', {
      amount: 40,
      merchant: 'Café',
      currency: 'ARS',
      direction: 'expense',
      source: 'wallet',
      account_id: ACCOUNT_ID,
      idempotency_key: 'wallet-idem-fixture-009',
      ingest_key: 'wallet-idem-fixture-009',
      tool_payload: null,
    });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.maybeSingle = async () => {
        if (table === 'wallet_card_account_maps') return { data: { account_id: ACCOUNT_ID }, error: null };
        return { data: null, error: null };
      };
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    mocks.rpc.mockResolvedValue({ data: { item: existing, duplicate: true }, error: null });
    const { ingestWalletItem } = await import('@/lib/services/pending-inbox');
    const result = await ingestWalletItem({
      userId: FIXTURE_USER,
      json: {
        amount: 40,
        currency: 'ARS',
        merchant: 'Café',
        cardName: 'Visa Ejemplo',
        timestamp: '2026-10-25T00:00:01.000Z',
      },
      idempotencyKey: 'wallet-idem-fixture-009',
    });
    expect(result.duplicate).toBe(true);
    expect(result.item.id).toBe(FIXTURE_ITEM);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'reserve_pending_inbox_item',
      expect.objectContaining({ p_client_keyed: true, p_lock_key: 'idemp:wallet-idem-fixture-009' })
    );
  });

  it('does not auto-confirm a complete payload that lacks occurredAt and Idempotency-Key', async () => {
    mocks.suggest.mockResolvedValue({
      categoryId: CATEGORY_ID,
      categoryName: 'Café',
      source: 'history',
    });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.maybeSingle = async () => {
        if (table === 'wallet_card_account_maps') return { data: { account_id: ACCOUNT_ID }, error: null };
        if (table === 'users') return { data: { wallet_auto_confirm: true }, error: null };
        return { data: null, error: null };
      };
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'reserve_pending_inbox_item') {
        return {
          data: {
            item: {
              ...itemRow('pending'),
              amount: 40,
              merchant: 'Café',
              suggestion_source: 'history',
              occurred_at: null,
              idempotency_key: null,
            },
            duplicate: false,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    const { ingestWalletItem } = await import('@/lib/services/pending-inbox');
    const result = await ingestWalletItem({
      userId: FIXTURE_USER,
      json: { amount: 40, currency: 'ARS', merchant: 'Café', cardName: 'Visa Ejemplo' },
    });
    expect(result.autoConfirmed).toBe(false);
    expect(result.duplicate).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('treats an anonymous retry across a bucket boundary as a new possible duplicate, not a silent replay', async () => {
    const base = {
      amount: 40,
      currency: 'ARS',
      merchant: 'Café',
      cardName: 'Visa Ejemplo',
      direction: 'expense' as const,
    };
    const parked = {
      ...itemRow('pending'),
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9',
      occurred_at: null,
      possible_duplicate_of: FIXTURE_ITEM,
      amount: 40,
      merchant: 'Café',
    };
    mocks.suggest.mockResolvedValue({
      categoryId: CATEGORY_ID,
      categoryName: 'Café',
      source: 'history',
    });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.maybeSingle = async () => {
        if (table === 'wallet_card_account_maps') return { data: { account_id: ACCOUNT_ID }, error: null };
        if (table === 'users') return { data: { wallet_auto_confirm: true }, error: null };
        return { data: null, error: null };
      };
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'reserve_pending_inbox_item') {
        return { data: { item: parked, duplicate: false }, error: null };
      }
      return { data: null, error: null };
    });
    const { ingestWalletItem } = await import('@/lib/services/pending-inbox');
    const result = await ingestWalletItem({
      userId: FIXTURE_USER,
      json: { amount: 40, currency: 'ARS', merchant: 'Café', cardName: 'Visa Ejemplo' },
    });
    expect(result.duplicate).toBe(false);
    expect(result.autoConfirmed).toBe(false);
    expect(result.item.id).toBe(parked.id);
    expect(result.item.possible_duplicate_of).toBe(FIXTURE_ITEM);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      'reserve_pending_inbox_item',
      expect.objectContaining({
        p_lookback_ms: INBOX_DEDUPE_WINDOW_MS,
        p_lock_key: inboxDedupeLockKey(FIXTURE_USER, base, ''),
        p_client_keyed: false,
      })
    );
  });

  it('rejects an explicit unsupported currency at ingest so it cannot auto-confirm as ARS', async () => {
    const { ingestWalletItem } = await import('@/lib/services/pending-inbox');
    await expect(
      ingestWalletItem({
        userId: FIXTURE_USER,
        json: { amount: 100, currency: 'GBP', merchant: 'Shop' },
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects GBP in free text at ingest so it cannot auto-confirm as ARS', async () => {
    const { ingestWalletItem } = await import('@/lib/services/pending-inbox');
    await expect(
      ingestWalletItem({
        userId: FIXTURE_USER,
        text: 'Compra GBP 100 en COTO con tarjeta Visa',
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not auto-confirm a date-only purchase even when the payload is otherwise complete', async () => {
    mocks.suggest.mockResolvedValue({
      categoryId: CATEGORY_ID,
      categoryName: 'Café',
      source: 'history',
    });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.maybeSingle = async () => {
        if (table === 'wallet_card_account_maps') return { data: { account_id: ACCOUNT_ID }, error: null };
        if (table === 'users') return { data: { wallet_auto_confirm: true }, error: null };
        return { data: null, error: null };
      };
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'reserve_pending_inbox_item') {
        return {
          data: {
            item: {
              ...itemRow('pending'),
              amount: 18,
              merchant: 'Café',
              suggestion_source: 'history',
              occurred_at: '2026-10-24T12:00:00-03:00',
              idempotency_key: null,
            },
            duplicate: false,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    const { ingestWalletItem } = await import('@/lib/services/pending-inbox');
    const result = await ingestWalletItem({
      userId: FIXTURE_USER,
      json: {
        amount: 18,
        currency: 'ARS',
        merchant: 'Café',
        cardName: 'Visa Ejemplo',
        timestamp: '2026-10-24',
      },
    });
    expect(result.autoConfirmed).toBe(false);
    expect(result.duplicate).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects a reused Idempotency-Key when the stored tool_payload is null or the source differs', async () => {
    const stored = itemRow('pending', {
      amount: 18,
      source: 'wallet',
      tool_payload: null,
      ingest_key: 'cross-channel-key',
      idempotency_key: 'cross-channel-key',
    });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.maybeSingle = async () => {
        if (table === 'pending_inbox_items') return { data: stored, error: null };
        return { data: null, error: null };
      };
      return q;
    });
    await expect(
      parkRegistryWrite({
        userId: FIXTURE_USER,
        amount: 900,
        currency: 'ARS',
        merchant: 'Otro',
        accountId: ACCOUNT_ID,
        source: 'api',
        ingestKey: 'cross-channel-key',
        toolPayload: { type: 'expense', amount: 900, accountId: ACCOUNT_ID },
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(canonicalInboxPayloadKey({
      source: 'wallet',
      amount: 18,
      currency: 'ARS',
      direction: 'expense',
      merchant: 'Ejemplo Café',
      accountId: ACCOUNT_ID,
      toolPayload: null,
    })).not.toBe(
      canonicalInboxPayloadKey({
        source: 'api',
        amount: 900,
        currency: 'ARS',
        direction: 'expense',
        merchant: 'Otro',
        accountId: ACCOUNT_ID,
        toolPayload: { type: 'expense', amount: 900, accountId: ACCOUNT_ID },
      })
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('preserves a full timestamp through confirm instead of collapsing it to civil noon', async () => {
    const parked = itemRow('confirming', {
      occurred_at: '2026-10-24T23:30:00-03:00',
      tool_payload: {
        type: 'expense',
        amount: 1250,
        accountId: ACCOUNT_ID,
        transactionDate: '2026-10-24T23:30:00-03:00',
      },
    });
    mocks.rpc.mockResolvedValue({ data: [parked], error: null });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.or = () => self;
      q.is = () => self;
      q.in = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table, value });
        return self;
      };
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') return { data: null, error: null };
        return { data: { ...parked, status: 'confirmed' }, error: null };
      };
      q.single = async () => ({ data: parked, error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    await confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM });
    expect(mocks.execute.mock.calls[0][1]).toMatchObject({
      transactionDate: '2026-10-24T23:30:00-03:00',
    });
    expect(mocks.execute.mock.calls[0][1].transactionDate).not.toBe('2026-10-24');
    const confirmed = updates.find((u) => u.table === 'pending_inbox_items' && u.value.status === 'confirmed');
    expect(confirmed?.value).toHaveProperty('account_id', ACCOUNT_ID);
    expect(confirmed?.value).not.toHaveProperty('request_canonical');
  });

  it('canonicalizes and dedupes pendingIds before confirming', async () => {
    mocks.rpc.mockResolvedValue({ data: [itemRow('confirming')], error: null });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.or = () => self;
      q.is = () => self;
      q.in = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table, value });
        return self;
      };
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') return { data: null, error: null };
        return { data: itemRow('confirmed'), error: null };
      };
      q.single = async () => ({ data: itemRow('confirming'), error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    expect(canonicalPendingInboxIds([FIXTURE_ITEM, FIXTURE_ITEM.toUpperCase()])).toEqual([FIXTURE_ITEM]);
    const confirmed = await confirmPendingItems({
      userId: FIXTURE_USER,
      itemIds: [FIXTURE_ITEM, FIXTURE_ITEM.toUpperCase()],
    });
    expect(confirmed).toHaveLength(1);
    expect(mocks.rpc.mock.calls.filter((call: unknown[]) => call[0] === 'claim_pending_inbox_item')).toHaveLength(1);
  });

  it('normalizes UUID, instants, currency defaults, trim and installments in request_canonical', () => {
    const upper = inboxRequestCanonical({
      source: 'api',
      amount: 18,
      currency: 'ars',
      direction: 'expense',
      occurredAt: '2026-10-24T23:30:00-03:00',
      merchant: ' Café ',
      accountId: ACCOUNT_ID.toUpperCase(),
    });
    const equivalent = inboxRequestCanonical({
      source: 'API',
      amount: 18,
      currency: undefined,
      direction: undefined,
      occurredAt: '2026-10-25T02:30:00.000Z',
      merchant: 'Café',
      accountId: ACCOUNT_ID,
      installments: 1,
    });
    expect(upper).toBe(equivalent);
    expect(upper).toContain('"account_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"');
    expect(upper).toContain('"occurred_at":"2026-10-25T02:30:00.000Z"');
    expect(upper).toContain('"currency":"ARS"');
    expect(upper).toContain('"installments":1');
    expect(upper).toContain('"merchant":"café"');
  });

  it('stores request_canonical from the request card and account, not the resolved account_id', async () => {
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.maybeSingle = async () => {
        if (table === 'wallet_card_account_maps') return { data: { account_id: ACCOUNT_ID }, error: null };
        return { data: null, error: null };
      };
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    const captured: { row: Record<string, unknown> | null } = { row: null };
    mocks.rpc.mockImplementation(async (fn: string, args: { p_row?: Record<string, unknown> }) => {
      if (fn === 'reserve_pending_inbox_item') {
        captured.row = args.p_row ?? null;
        return { data: { item: { ...args.p_row, id: FIXTURE_ITEM, status: 'pending' }, duplicate: false }, error: null };
      }
      return { data: null, error: null };
    });
    const { ingestWalletItem } = await import('@/lib/services/pending-inbox');
    await ingestWalletItem({
      userId: FIXTURE_USER,
      json: { amount: 18, currency: 'ARS', merchant: 'Café', cardName: 'Visa AAA' },
      idempotencyKey: 'wallet-idem-canonical-card',
    });
    expect(captured.row?.account_id).toBe(ACCOUNT_ID);
    expect(captured.row?.request_canonical).toBe(
      inboxRequestCanonical({
        source: 'wallet',
        amount: 18,
        currency: 'ARS',
        direction: 'expense',
        merchant: 'Café',
        cardName: 'Visa AAA',
        accountId: null,
      })
    );
    expect(String(captured.row?.request_canonical)).toContain('"account_id":null');
    expect(String(captured.row?.request_canonical)).toContain('"card":"visa aaa"');
  });

  it('replays a 25h-old keyed park when request_canonical matches after confirm wrote account_id', async () => {
    const canonical = inboxRequestCanonical({
      source: 'api',
      amount: 18,
      currency: 'ARS',
      direction: 'expense',
      merchant: 'Café',
      accountId: null,
      occurredAt: '2026-10-24T23:30:00-03:00',
    });
    const stored = itemRow('confirmed', {
      amount: 18,
      merchant: 'Café',
      account_id: ACCOUNT_ID,
      source: 'api',
      ingest_key: 'api-idem-old',
      idempotency_key: 'api-idem-old',
      request_canonical: canonical,
      created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      occurred_at: '2026-10-24T23:30:00-03:00',
    });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.maybeSingle = async () => {
        if (table === 'pending_inbox_items') return { data: stored, error: null };
        return { data: null, error: null };
      };
      return q;
    });
    const replayed = await parkRegistryWrite({
      userId: FIXTURE_USER,
      amount: 18,
      currency: 'ARS',
      merchant: 'Café',
      occurredAt: '2026-10-24T23:30:00-03:00',
      source: 'api',
      ingestKey: 'api-idem-old',
      toolPayload: { type: 'expense', amount: 18 },
    });
    expect(replayed.id).toBe(FIXTURE_ITEM);
    expect(replayed.status).toBe('confirmed');
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('attaches an ownership-checked original summary including confirmed originals', async () => {
    const originalId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9';
    const flagged = itemRow('pending', { possible_duplicate_of: originalId });
    const original = {
      id: originalId,
      merchant: 'Original café',
      amount: 18,
      currency: 'ARS',
      status: 'confirmed',
    };
    const userFilters: unknown[][] = [];
    mocks.from.mockImplementation(() => {
      const q: Record<string, unknown> = {};
      const self = q;
      let selected = '*';
      q.select = (cols?: string) => {
        selected = cols || '*';
        return self;
      };
      q.eq = (...args: unknown[]) => {
        userFilters.push(args);
        return self;
      };
      q.in = () => self;
      q.order = () => self;
      q.limit = () => self;
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data: selected === '*' ? [flagged] : [original],
          error: null,
        });
      return q;
    });
    const listed = await listPendingItems(FIXTURE_USER, 'pending');
    expect(listed).toHaveLength(1);
    expect(listed[0].possible_duplicate).toEqual(original);
    expect(userFilters.some((args) => args[0] === 'user_id' && args[1] === FIXTURE_USER)).toBe(true);
  });

  it('rethrows FxUnavailableError from confirm instead of wrapping it as 400', async () => {
    const parked = itemRow('confirming', {
      tool_payload: { type: 'expense', amount: 10, accountId: ACCOUNT_ID, currency: 'USD' },
    });
    mocks.rpc.mockResolvedValue({ data: [parked], error: null });
    mocks.execute.mockRejectedValue(new FxUnavailableError('USD→ARS'));
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.or = () => self;
      q.is = () => self;
      q.in = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table, value });
        return self;
      };
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') return { data: null, error: null };
        return { data: parked, error: null };
      };
      q.single = async () => ({ data: parked, error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    await expect(confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM })).rejects.toBeInstanceOf(
      FxUnavailableError
    );
    expect(updates.some((u) => u.table === 'pending_inbox_items' && u.value.status === 'confirmed')).toBe(false);
  });
});
