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
  PendingBatchConfirmError,
  type PendingInboxItem,
} from '@/lib/services/pending-inbox';
import { ApiError } from '@/lib/api-handler';
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
  findAccount: vi.fn(async () => ({ account: null, confidence: 'none' as const })),
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
    findByNameFuzzy: mocks.findAccount,
  },
}));

vi.mock('@/lib/integrations/merchant-category', () => ({
  suggestCategoryFromMerchant: () => mocks.suggest(),
}));

const updates: Array<{ table: string; value: Record<string, unknown> }> = [];

const CLAIM_ID = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
const SYSTEM_CATEGORY_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';

function itemRow(status: PendingInboxItem['status'], extras: Partial<PendingInboxItem> = {}): PendingInboxItem {
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
    suggestion_source: null,
    direction: 'expense',
    amount_ambiguous: false,
    ingest_key: `wallet:${FIXTURE_ITEM}`,
    idempotency_key: null,
    source: 'wallet',
    raw_text: null,
    created_at: '2026-10-24T20:00:00.000Z',
    claim_id: status === 'confirming' ? CLAIM_ID : null,
    ...extras,
  } as PendingInboxItem;
}

describe('pending inbox confirm idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    mocks.listAccounts.mockResolvedValue([{ id: ACCOUNT_ID, name: 'Visa Ejemplo', currency: 'ARS' }]);
    mocks.findAccount.mockResolvedValue({ account: null, confidence: 'none' });
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
      q.maybeSingle = async () => {
        if (table === 'categories') {
          return { data: { id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }, error: null };
        }
        return {
          data: table === 'pending_inbox_items' ? itemRow('confirmed') : null,
          error: null,
        };
      };
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
      q.maybeSingle = async () => {
        if (table === 'categories') {
          return { data: { id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }, error: null };
        }
        return {
          data: table === 'pending_inbox_items' ? itemRow(status) : null,
          error: null,
        };
      };
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

  it('restores a single-item uncertain claim to uncertain instead of pending', async () => {
    mocks.rpc.mockResolvedValue({ data: [itemRow('confirming')], error: null });
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
      q.maybeSingle = async () => {
        if (table === 'categories') {
          return { data: { id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }, error: null };
        }
        return { data: null, error: null };
      };
      q.single = async () => ({ data: itemRow('confirming'), error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    mocks.execute.mockRejectedValue(new Error('ledger exploded'));

    await expect(
      confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM, priorStatus: 'uncertain' })
    ).rejects.toThrow('ledger exploded');
    expect(updates.some((u) => u.table === 'pending_inbox_items' && u.value.status === 'uncertain')).toBe(true);
    expect(updates.some((u) => u.table === 'pending_inbox_items' && u.value.status === 'pending')).toBe(false);
  });

  it('releases a stale single-item confirming row using restoreStatus', async () => {
    const stale = itemRow('confirming', {
      updated_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    });
    expect(isStaleConfirming(stale)).toBe(true);
    let claimCalls = 0;
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn !== 'claim_pending_inbox_item') return { data: null, error: null };
      claimCalls += 1;
      if (claimCalls === 1) return { data: [], error: null };
      return { data: [itemRow('confirming')], error: null };
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
      q.maybeSingle = async () => {
        if (table === 'pending_inbox_items') return { data: stale, error: null };
        if (table === 'transaction_requests') return { data: null, error: null };
        if (table === 'categories') {
          return { data: { id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }, error: null };
        }
        return { data: null, error: null };
      };
      q.single = async () => ({ data: { id: FIXTURE_USER, default_currency: 'ARS' }, error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    await confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM, priorStatus: 'uncertain' });
    expect(claimCalls).toBe(2);
    expect(updates.some((u) => u.table === 'pending_inbox_items' && u.value.status === 'uncertain')).toBe(true);
    expect(
      updates.find((u) => u.table === 'pending_inbox_items' && u.value.status === 'uncertain' && u.value.claim_id === null)
    ).toBeTruthy();
  });

  it('restores a failed confirm only for the owning claim_id so a concurrent claim is not clobbered', async () => {
    const claimA = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd1';
    const claimB = 'dddddddd-dddd-4ddd-8ddd-ddddddddddd2';
    const store = { status: 'confirming' as PendingInboxItem['status'], claim_id: claimB as string | null };
    mocks.rpc.mockResolvedValue({ data: [itemRow('confirming', { claim_id: claimA })], error: null });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      const filters: Record<string, unknown> = {};
      let pendingValue: Record<string, unknown> | null = null;
      const apply = () => {
        if (table !== 'pending_inbox_items' || !pendingValue) return;
        const matchesClaim = filters.claim_id == null || filters.claim_id === store.claim_id;
        const matchesStatus = filters.status == null || filters.status === store.status;
        if (matchesClaim && matchesStatus) {
          if (typeof pendingValue.status === 'string') {
            store.status = pendingValue.status as PendingInboxItem['status'];
          }
          if ('claim_id' in pendingValue) store.claim_id = (pendingValue.claim_id as string | null) ?? null;
        }
      };
      q.select = () => self;
      q.eq = (column: string, value: unknown) => {
        filters[column] = value;
        return self;
      };
      q.in = () => self;
      q.is = () => self;
      q.or = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table, value });
        pendingValue = value;
        return self;
      };
      q.maybeSingle = async () => {
        apply();
        if (table === 'categories') {
          return { data: { id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }, error: null };
        }
        return { data: itemRow(store.status, { claim_id: store.claim_id }), error: null };
      };
      q.single = async () => ({ data: itemRow('confirming', { claim_id: store.claim_id }), error: null });
      q.then = (resolve: (v: unknown) => unknown) => {
        apply();
        return resolve({ data: [], error: null });
      };
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    mocks.execute.mockRejectedValue(new Error('ledger exploded'));

    await expect(
      confirmPendingItem({
        userId: FIXTURE_USER,
        itemId: FIXTURE_ITEM,
        claimedRow: itemRow('confirming', { claim_id: claimA }),
      })
    ).rejects.toThrow('ledger exploded');
    expect(updates.some((u) => u.table === 'pending_inbox_items' && u.value.status === 'pending')).toBe(true);
    expect(store.status).toBe('confirming');
    expect(store.claim_id).toBe(claimB);
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
      q.maybeSingle = async () => {
        if (table === 'categories') {
          return {
            data: { id: SYSTEM_CATEGORY_ID, user_id: null, name: 'Comida', is_system: true },
            error: null,
          };
        }
        return {
          data: table === 'pending_inbox_items' ? { ...parked, status: 'confirmed' } : null,
          error: null,
        };
      };
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
    const originalCanonical = inboxRequestCanonical({
      source: 'api',
      amount: 10,
      currency: 'ARS',
      direction: 'expense',
      merchant: 'Café',
      accountId: null,
      cardName: null,
      occurredAt: null,
      installments: 1,
    });
    const existing = {
      ...itemRow('pending'),
      amount: 10,
      currency: 'ARS',
      merchant: 'Café',
      source: 'api',
      account_id: null,
      occurred_at: null,
      card_name: null,
      ingest_key: 'idem-park-fixture-009',
      idempotency_key: 'idem-park-fixture-009',
      request_canonical: originalCanonical,
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
      q.or = () => self;
      q.is = () => self;
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
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
      q.or = () => self;
      q.is = () => self;
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
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
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data:
            table === 'pending_inbox_items'
              ? [itemRow('confirming')]
              : table === 'categories'
                ? [{ id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }]
                : [],
          error: null,
        });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    expect(canonicalPendingInboxIds([FIXTURE_ITEM, FIXTURE_ITEM.toUpperCase()])).toEqual([FIXTURE_ITEM]);
    const confirmed = await confirmPendingItems({
      userId: FIXTURE_USER,
      itemIds: [FIXTURE_ITEM, FIXTURE_ITEM.toUpperCase()],
    });
    expect(confirmed).toHaveLength(1);
    expect(mocks.rpc.mock.calls.filter((call: unknown[]) => call[0] === 'claim_pending_inbox_items')).toHaveLength(1);
    expect(mocks.rpc.mock.calls.filter((call: unknown[]) => call[0] === 'claim_pending_inbox_item')).toHaveLength(0);
  });

  it('claims every batch item in one RPC and does not call the single-item claim', async () => {
    const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9';
    const pending = itemRow('pending');
    const second = itemRow('pending', { id: secondId, fingerprint: 'fp-batch-2' });
    mocks.rpc.mockImplementation(async (fn: string, args: { p_item_ids?: string[] }) => {
      if (fn === 'claim_pending_inbox_items') {
        expect(args.p_item_ids).toEqual([FIXTURE_ITEM, secondId]);
        return {
          data: [itemRow('confirming'), itemRow('confirming', { id: secondId })],
          error: null,
        };
      }
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
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
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') return { data: null, error: null };
        return { data: itemRow('confirmed'), error: null };
      };
      q.single = async () => ({ data: itemRow('confirmed'), error: null });
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data:
            table === 'pending_inbox_items'
              ? [pending, second]
              : table === 'categories'
                ? [{ id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }]
                : [],
          error: null,
        });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    const confirmed = await confirmPendingItems({
      userId: FIXTURE_USER,
      itemIds: [FIXTURE_ITEM, secondId],
    });
    expect(confirmed).toHaveLength(2);
    expect(mocks.rpc.mock.calls.filter((call: unknown[]) => call[0] === 'claim_pending_inbox_items')).toHaveLength(1);
    expect(mocks.rpc.mock.calls.filter((call: unknown[]) => call[0] === 'claim_pending_inbox_item')).toHaveLength(0);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it('fails the whole concurrent batch when the atomic claim loses', async () => {
    let claimed = false;
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn !== 'claim_pending_inbox_items') return { data: null, error: { message: `unexpected rpc ${fn}` } };
      if (claimed) return { data: null, error: { message: 'Este pendiente se está confirmando.' } };
      claimed = true;
      return { data: [itemRow('confirming')], error: null };
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
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') return { data: null, error: null };
        return { data: itemRow('confirmed'), error: null };
      };
      q.single = async () => ({ data: itemRow('confirmed'), error: null });
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data:
            table === 'pending_inbox_items'
              ? [itemRow('pending')]
              : table === 'categories'
                ? [{ id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }]
                : [],
          error: null,
        });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    const results = await Promise.allSettled([
      confirmPendingItems({ userId: FIXTURE_USER, itemIds: [FIXTURE_ITEM] }),
      confirmPendingItems({ userId: FIXTURE_USER, itemIds: [FIXTURE_ITEM] }),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
    expect(mocks.rpc.mock.calls.filter((call: unknown[]) => call[0] === 'claim_pending_inbox_items')).toHaveLength(2);
    expect(mocks.rpc.mock.calls.filter((call: unknown[]) => call[0] === 'claim_pending_inbox_item')).toHaveLength(0);
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
    expect(upper.startsWith('v1:')).toBe(true);
    expect(upper).toContain('"account_id":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"');
    expect(upper).toContain('"occurred_at":"2026-10-25T02:30:00.000Z"');
    expect(upper).toContain('"currency":"ARS"');
    expect(upper).toContain('"installments":1');
    expect(upper).toContain('"merchant":"café"');
    expect(upper).toContain('"amount":"18.00"');
    expect(upper).toContain('"type":"expense"');
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

  it('NFC-normalizes merchants in request_canonical', () => {
    expect(
      inboxRequestCanonical({ source: 'wallet', amount: 18, type: 'expense', merchant: 'Café' })
    ).toBe(
      inboxRequestCanonical({ source: 'wallet', amount: 18, type: 'expense', merchant: 'Cafe\u0301' })
    );
  });

  it('rejects amounts with more than two decimals before canonicalizing', () => {
    expect(() =>
      inboxRequestCanonical({ source: 'api', amount: 1.005, type: 'expense' })
    ).toThrow(/dos decimales/);
    expect(inboxRequestCanonical({ source: 'api', amount: 1, type: 'expense' })).toContain('"amount":"1.00"');
  });

  it('accepts large ARS amounts with cents using an exact decimal check', () => {
    expect(inboxRequestCanonical({ source: 'api', amount: 1048576.37, type: 'expense' })).toContain(
      '"amount":"1048576.37"'
    );
    expect(inboxRequestCanonical({ source: 'api', amount: 1234567.89, type: 'expense' })).toContain(
      '"amount":"1234567.89"'
    );
    expect(inboxRequestCanonical({ source: 'api', amount: 10000000.37, type: 'expense' })).toContain(
      '"amount":"10000000.37"'
    );
  });

  it('returns 409 and writes nothing when a confirmed expense is resent as a transfer with the same key', async () => {
    const canonical = inboxRequestCanonical({
      source: 'api',
      amount: 40,
      type: 'expense',
      merchant: 'Transfer café',
      accountId: ACCOUNT_ID,
    });
    const stored = itemRow('confirmed', {
      amount: 40,
      merchant: 'Transfer café',
      source: 'api',
      ingest_key: 'api-expense-40',
      idempotency_key: 'api-expense-40',
      request_canonical: canonical,
    });
    mocks.from.mockImplementation(() => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.maybeSingle = async () => ({ data: stored, error: null });
      return q;
    });
    await expect(
      parkRegistryWrite({
        userId: FIXTURE_USER,
        amount: 40,
        currency: 'ARS',
        merchant: 'Transfer café',
        accountId: ACCOUNT_ID,
        source: 'api',
        ingestKey: 'api-expense-40',
        toolPayload: {
          type: 'transfer',
          amount: 40,
          accountId: ACCOUNT_ID,
          destinationAccountId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
        },
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('replays an exact keyed wallet request after 400 days', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T12:00:00.000Z'));
    const occurredAt = '2026-10-23T15:00:00.000Z';
    const canonical = inboxRequestCanonical({
      source: 'wallet',
      amount: 18,
      type: 'expense',
      direction: 'expense',
      currency: 'ARS',
      merchant: 'Café',
      occurredAt,
    });
    const stored = itemRow('pending', {
      amount: 18,
      merchant: 'Café',
      card_name: null,
      account_id: null,
      occurred_at: occurredAt,
      ingest_key: 'wallet-400d',
      idempotency_key: 'wallet-400d',
      request_canonical: canonical,
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
    try {
      vi.setSystemTime(new Date('2027-11-28T12:00:00.000Z'));
      const { ingestWalletItem } = await import('@/lib/services/pending-inbox');
      const result = await ingestWalletItem({
        userId: FIXTURE_USER,
        json: { amount: 18, currency: 'ARS', merchant: 'Café', timestamp: occurredAt },
        idempotencyKey: 'wallet-400d',
      });
      expect(result.duplicate).toBe(true);
      expect(result.item.id).toBe(FIXTURE_ITEM);
      expect(mocks.rpc).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('validates mixed confirm batches up front and does not write', async () => {
    const pending = itemRow('pending');
    const discardedId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9';
    const discarded = itemRow('discarded', { id: discardedId });
    mocks.from.mockImplementation(() => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.in = () => self;
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [pending, discarded], error: null });
      return q;
    });
    await expect(
      confirmPendingItems({
        userId: FIXTURE_USER,
        itemIds: [FIXTURE_ITEM, discardedId],
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('does not write item 1 when item 2 is already confirming', async () => {
    const pending = itemRow('pending');
    const confirmingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9';
    const confirming = itemRow('confirming', {
      id: confirmingId,
      updated_at: new Date().toISOString(),
    });
    expect(isStaleConfirming(confirming)).toBe(false);
    mocks.from.mockImplementation(() => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.in = () => self;
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [pending, confirming], error: null });
      return q;
    });
    await expect(
      confirmPendingItems({
        userId: FIXTURE_USER,
        itemIds: [FIXTURE_ITEM, confirmingId],
      })
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('does not write item 1 when item 2 has no account', async () => {
    const pending = itemRow('pending');
    const missingAccountId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9';
    const missingAccount = itemRow('pending', {
      id: missingAccountId,
      account_id: null,
      tool_payload: { type: 'expense', amount: 13 },
    });
    mocks.from.mockImplementation(() => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.in = () => self;
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [pending, missingAccount], error: null });
      return q;
    });
    await expect(
      confirmPendingItems({
        userId: FIXTURE_USER,
        itemIds: [FIXTURE_ITEM, missingAccountId],
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('parks a JSON amount with more than two decimals and never auto-confirms the rounded value', async () => {
    const captured: { row: Record<string, unknown> | null } = { row: null };
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
    mocks.rpc.mockImplementation(async (fn: string, args: { p_row?: Record<string, unknown> }) => {
      if (fn === 'reserve_pending_inbox_item') {
        captured.row = args.p_row ?? null;
        return {
          data: { item: { ...args.p_row, id: FIXTURE_ITEM, status: 'pending' }, duplicate: false },
          error: null,
        };
      }
      return { data: null, error: null };
    });
    const { ingestWalletItem } = await import('@/lib/services/pending-inbox');
    const rawJson =
      '{"amount":40.129,"currency":"ARS","merchant":"Café","cardName":"Visa Ejemplo","timestamp":"2026-10-25T12:00:00.000Z"}';
    await expect(
      ingestWalletItem({
        userId: FIXTURE_USER,
        json: JSON.parse(rawJson) as Record<string, unknown>,
        rawJson,
        idempotencyKey: 'wallet-excess-decimals',
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(captured.row).toBeNull();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('reverts leftover confirming items when ledger insert N fails in a 3-item batch', async () => {
    const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9';
    const thirdId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc9';
    const first = itemRow('pending');
    const second = itemRow('pending', { id: secondId });
    const third = itemRow('pending', { id: thirdId });
    const claimById = new Map([
      [FIXTURE_ITEM, itemRow('confirming')],
      [secondId, itemRow('confirming', { id: secondId })],
      [thirdId, itemRow('confirming', { id: thirdId })],
    ]);
    mocks.rpc.mockImplementation(async (fn: string, args: { p_item_ids?: string[] }) => {
      if (fn === 'claim_pending_inbox_items') {
        expect(args.p_item_ids).toEqual([FIXTURE_ITEM, secondId, thirdId]);
        return { data: [...claimById.values()], error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    });
    mocks.execute
      .mockResolvedValueOnce({ response: { success: true }, executed: [{ id: 'tx-1' }] })
      .mockRejectedValueOnce(new ApiError('ledger insert failed', 400));
    const reverted: string[] = [];
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      let currentId: string | null = null;
      q.select = () => self;
      q.eq = (column: string, value: unknown) => {
        if (column === 'id' && typeof value === 'string') currentId = value;
        return self;
      };
      q.in = () => self;
      q.is = () => self;
      q.or = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table, value });
        const chain: Record<string, unknown> = {};
        chain.eq = (column: string, val: unknown) => {
          if (column === 'id' && typeof val === 'string') {
            currentId = val;
            if (table === 'pending_inbox_items' && value.status === 'pending') reverted.push(val);
          }
          return chain;
        };
        chain.select = () => chain;
        chain.maybeSingle = q.maybeSingle;
        return chain;
      };
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') return { data: null, error: null };
        if (table === 'categories') {
          return { data: { id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }, error: null };
        }
        return { data: itemRow('confirmed', { id: currentId || FIXTURE_ITEM }), error: null };
      };
      q.single = async () => ({ data: { id: FIXTURE_USER, default_currency: 'ARS' }, error: null });
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data:
            table === 'pending_inbox_items'
              ? [first, second, third]
              : table === 'categories'
                ? [{ id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }]
                : [],
          error: null,
        });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    const error = await confirmPendingItems({
      userId: FIXTURE_USER,
      itemIds: [FIXTURE_ITEM, secondId, thirdId],
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PendingBatchConfirmError);
    const batch = error as PendingBatchConfirmError;
    expect(batch.items).toEqual([
      { pendingId: FIXTURE_ITEM, status: 'confirmed' },
      { pendingId: secondId, status: 'failed', error: 'ledger insert failed' },
      { pendingId: thirdId, status: 'reverted' },
    ]);
    expect(batch.executedCount).toBe(1);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(reverted).toContain(thirdId);
    expect(updates.some((u) => u.table === 'pending_inbox_items' && u.value.status === 'confirming')).toBe(false);
  });

  it('does not write item 1 when item 2 has a nonexistent account name', async () => {
    const namedId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9';
    const pending = itemRow('pending');
    const named = itemRow('pending', {
      id: namedId,
      account_id: null,
      tool_payload: { type: 'expense', amount: 13, account: 'Cuenta Fantasma' },
    });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.in = () => self;
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data:
            table === 'pending_inbox_items'
              ? [pending, named]
              : table === 'categories'
                ? [{ id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }]
                : [],
          error: null,
        });
      return q;
    });
    await expect(
      confirmPendingItems({
        userId: FIXTURE_USER,
        itemIds: [FIXTURE_ITEM, namedId],
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('rejects a foreign category before the ledger write', async () => {
    const foreign = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb8';
    const parked = itemRow('confirming', { category_id: foreign });
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
      q.maybeSingle = async () => {
        if (table === 'categories') {
          return { data: { id: foreign, user_id: '22222222-2222-4222-8222-222222222222', is_system: false }, error: null };
        }
        if (table === 'transaction_requests') return { data: null, error: null };
        return { data: parked, error: null };
      };
      q.single = async () => ({ data: { id: FIXTURE_USER, default_currency: 'ARS' }, error: null });
      q.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    await expect(confirmPendingItem({ userId: FIXTURE_USER, itemId: FIXTURE_ITEM })).rejects.toMatchObject({
      status: 400,
    });
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(updates.some((u) => u.table === 'pending_inbox_items' && u.value.status === 'confirmed')).toBe(false);
  });

  it('recovers a stale confirming item on the batch path', async () => {
    const stale = itemRow('confirming', {
      updated_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    });
    expect(isStaleConfirming(stale)).toBe(true);
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'claim_pending_inbox_items') {
        return { data: [itemRow('confirming')], error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
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
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') return { data: null, error: null };
        if (table === 'categories') {
          return { data: { id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }, error: null };
        }
        return { data: itemRow('confirmed'), error: null };
      };
      q.single = async () => ({ data: { id: FIXTURE_USER, default_currency: 'ARS' }, error: null });
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data:
            table === 'pending_inbox_items'
              ? [stale]
              : table === 'categories'
                ? [{ id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }]
                : [],
          error: null,
        });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    const confirmed = await confirmPendingItems({ userId: FIXTURE_USER, itemIds: [FIXTURE_ITEM] });
    expect(confirmed).toHaveLength(1);
    expect(mocks.rpc.mock.calls.some((call: unknown[]) => call[0] === 'claim_pending_inbox_items')).toBe(true);
    expect(updates.some((u) => u.table === 'pending_inbox_items' && u.value.status === 'pending')).toBe(true);
  });

  it('counts only newly written items when a mixed batch includes already-confirmed ids', async () => {
    const pendingId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9';
    const already = itemRow('confirmed');
    const pending = itemRow('pending', { id: pendingId });
    mocks.rpc.mockImplementation(async (fn: string, args: { p_item_ids?: string[] }) => {
      if (fn === 'claim_pending_inbox_items') {
        expect(args.p_item_ids).toEqual([pendingId]);
        return { data: [itemRow('confirming', { id: pendingId })], error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      let currentId: string | null = null;
      q.select = () => self;
      q.eq = (column: string, value: unknown) => {
        if (column === 'id' && typeof value === 'string') currentId = value;
        return self;
      };
      q.in = () => self;
      q.is = () => self;
      q.or = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table, value });
        return self;
      };
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') return { data: null, error: null };
        if (table === 'categories') {
          return { data: { id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }, error: null };
        }
        return { data: itemRow('confirmed', { id: currentId || pendingId }), error: null };
      };
      q.single = async () => ({ data: { id: FIXTURE_USER, default_currency: 'ARS' }, error: null });
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data:
            table === 'pending_inbox_items'
              ? [already, pending]
              : table === 'categories'
                ? [{ id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }]
                : [],
          error: null,
        });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    const confirmed = await confirmPendingItems({
      userId: FIXTURE_USER,
      itemIds: [FIXTURE_ITEM, pendingId],
    });
    expect(confirmed).toHaveLength(2);
    expect(confirmed.executedCount).toBe(1);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it('surfaces a leftover release error in per-item results instead of calling it reverted', async () => {
    const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9';
    const thirdId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc9';
    const first = itemRow('pending');
    const second = itemRow('pending', { id: secondId });
    const third = itemRow('pending', { id: thirdId });
    mocks.rpc.mockImplementation(async (fn: string, args: { p_item_ids?: string[] }) => {
      if (fn === 'claim_pending_inbox_items') {
        expect(args.p_item_ids).toEqual([FIXTURE_ITEM, secondId, thirdId]);
        return {
          data: [
            itemRow('confirming'),
            itemRow('confirming', { id: secondId }),
            itemRow('confirming', { id: thirdId }),
          ],
          error: null,
        };
      }
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    });
    mocks.execute
      .mockResolvedValueOnce({ response: { success: true }, executed: [{ id: 'tx-1' }] })
      .mockRejectedValueOnce(new ApiError('ledger insert failed', 400));
    const logged: unknown[][] = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      let currentId: string | null = null;
      q.select = () => self;
      q.eq = (column: string, value: unknown) => {
        if (column === 'id' && typeof value === 'string') currentId = value;
        return self;
      };
      q.in = () => self;
      q.is = () => self;
      q.or = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table, value });
        const chain: Record<string, unknown> = {};
        chain.eq = (column: string, val: unknown) => {
          if (column === 'id' && typeof val === 'string') currentId = val;
          return chain;
        };
        chain.select = () => chain;
        chain.maybeSingle = q.maybeSingle;
        chain.then = (resolve: (v: unknown) => unknown) =>
          resolve(
            table === 'pending_inbox_items' && value.status === 'pending'
              ? { data: null, error: { message: 'release failed' } }
              : { data: null, error: null }
          );
        return chain;
      };
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') return { data: null, error: null };
        if (table === 'categories') {
          return { data: { id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }, error: null };
        }
        return { data: itemRow('confirmed', { id: currentId || FIXTURE_ITEM }), error: null };
      };
      q.single = async () => ({ data: { id: FIXTURE_USER, default_currency: 'ARS' }, error: null });
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data:
            table === 'pending_inbox_items'
              ? [first, second, third]
              : table === 'categories'
                ? [{ id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }]
                : [],
          error: null,
        });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    const error = await confirmPendingItems({
      userId: FIXTURE_USER,
      itemIds: [FIXTURE_ITEM, secondId, thirdId],
    }).catch((caught: unknown) => caught);
    errorSpy.mockRestore();
    expect(error).toBeInstanceOf(PendingBatchConfirmError);
    const batch = error as PendingBatchConfirmError;
    expect(batch.items).toEqual([
      { pendingId: FIXTURE_ITEM, status: 'confirmed' },
      { pendingId: secondId, status: 'failed', error: 'ledger insert failed' },
      { pendingId: thirdId, status: 'failed', error: 'release failed' },
    ]);
    expect(logged.some((args) => args[0] === '[inbox] leftover claim release failed')).toBe(true);
  });

  it('treats a leftover release that matches zero rows as failed, not reverted', async () => {
    const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9';
    const thirdId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc9';
    const first = itemRow('pending');
    const second = itemRow('pending', { id: secondId });
    const third = itemRow('pending', { id: thirdId });
    mocks.rpc.mockImplementation(async (fn: string, args: { p_item_ids?: string[] }) => {
      if (fn === 'claim_pending_inbox_items') {
        expect(args.p_item_ids).toEqual([FIXTURE_ITEM, secondId, thirdId]);
        return {
          data: [
            itemRow('confirming'),
            itemRow('confirming', { id: secondId }),
            itemRow('confirming', { id: thirdId }),
          ],
          error: null,
        };
      }
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    });
    mocks.execute
      .mockResolvedValueOnce({ response: { success: true }, executed: [{ id: 'tx-1' }] })
      .mockRejectedValueOnce(new ApiError('ledger insert failed', 400));
    const logged: unknown[][] = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      logged.push(args);
    });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      let currentId: string | null = null;
      q.select = () => self;
      q.eq = (column: string, value: unknown) => {
        if (column === 'id' && typeof value === 'string') currentId = value;
        return self;
      };
      q.in = () => self;
      q.is = () => self;
      q.or = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table, value });
        const chain: Record<string, unknown> = {};
        chain.eq = (column: string, val: unknown) => {
          if (column === 'id' && typeof val === 'string') currentId = val;
          return chain;
        };
        chain.select = () => chain;
        chain.maybeSingle = q.maybeSingle;
        chain.then = (resolve: (v: unknown) => unknown) =>
          resolve(
            table === 'pending_inbox_items' && value.status === 'pending'
              ? { data: [], error: null }
              : { data: [{ id: currentId }], error: null }
          );
        return chain;
      };
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') return { data: null, error: null };
        if (table === 'categories') {
          return { data: { id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }, error: null };
        }
        return { data: itemRow('confirmed', { id: currentId || FIXTURE_ITEM }), error: null };
      };
      q.single = async () => ({ data: { id: FIXTURE_USER, default_currency: 'ARS' }, error: null });
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data:
            table === 'pending_inbox_items'
              ? [first, second, third]
              : table === 'categories'
                ? [{ id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }]
                : [],
          error: null,
        });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    const error = await confirmPendingItems({
      userId: FIXTURE_USER,
      itemIds: [FIXTURE_ITEM, secondId, thirdId],
    }).catch((caught: unknown) => caught);
    errorSpy.mockRestore();
    expect(error).toBeInstanceOf(PendingBatchConfirmError);
    const batch = error as PendingBatchConfirmError;
    expect(batch.items).toEqual([
      { pendingId: FIXTURE_ITEM, status: 'confirmed' },
      { pendingId: secondId, status: 'failed', error: 'ledger insert failed' },
      { pendingId: thirdId, status: 'failed', error: 'No se pudo liberar el pendiente.' },
    ]);
    expect(logged.some((args) => args[0] === '[inbox] leftover claim release failed')).toBe(true);
  });

  it('does not write when a later transfer destination is foreign', async () => {
    const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9';
    const thirdId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc9';
    const foreignDest = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';
    const first = itemRow('pending');
    const transfer = itemRow('pending', {
      id: secondId,
      tool_payload: {
        type: 'transfer',
        amount: 20,
        accountId: ACCOUNT_ID,
        destinationAccountId: foreignDest,
      },
    });
    const third = itemRow('pending', { id: thirdId });
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      q.select = () => self;
      q.eq = () => self;
      q.in = () => self;
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data:
            table === 'pending_inbox_items'
              ? [first, transfer, third]
              : table === 'categories'
                ? [{ id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }]
                : [],
          error: null,
        });
      return q;
    });
    await expect(
      confirmPendingItems({
        userId: FIXTURE_USER,
        itemIds: [FIXTURE_ITEM, secondId, thirdId],
      })
    ).rejects.toMatchObject({ status: 400, message: 'La cuenta no existe.' });
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it('restores leftover uncertain items to uncertain instead of pending', async () => {
    const secondId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9';
    const thirdId = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc9';
    const first = itemRow('pending');
    const second = itemRow('pending', { id: secondId });
    const third = itemRow('uncertain', { id: thirdId });
    mocks.rpc.mockImplementation(async (fn: string, args: { p_item_ids?: string[] }) => {
      if (fn === 'claim_pending_inbox_items') {
        return {
          data: [
            itemRow('confirming'),
            itemRow('confirming', { id: secondId }),
            itemRow('confirming', { id: thirdId }),
          ],
          error: null,
        };
      }
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    });
    mocks.execute
      .mockResolvedValueOnce({ response: { success: true }, executed: [{ id: 'tx-1' }] })
      .mockRejectedValueOnce(new ApiError('ledger insert failed', 400));
    mocks.from.mockImplementation((table: string) => {
      const q: Record<string, unknown> = {};
      const self = q;
      let currentId: string | null = null;
      q.select = () => self;
      q.eq = (column: string, value: unknown) => {
        if (column === 'id' && typeof value === 'string') currentId = value;
        return self;
      };
      q.in = () => self;
      q.is = () => self;
      q.or = () => self;
      q.update = (value: Record<string, unknown>) => {
        updates.push({ table, value });
        const chain: Record<string, unknown> = {};
        chain.eq = (column: string, val: unknown) => {
          if (column === 'id' && typeof val === 'string') currentId = val;
          return chain;
        };
        chain.is = () => chain;
        chain.select = () => chain;
        chain.maybeSingle = q.maybeSingle;
        chain.then = (resolve: (v: unknown) => unknown) =>
          resolve({ data: [{ id: currentId }], error: null });
        return chain;
      };
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') return { data: null, error: null };
        if (table === 'categories') {
          return { data: { id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }, error: null };
        }
        return { data: itemRow('confirmed', { id: currentId || FIXTURE_ITEM }), error: null };
      };
      q.single = async () => ({ data: { id: FIXTURE_USER, default_currency: 'ARS' }, error: null });
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data:
            table === 'pending_inbox_items'
              ? [first, second, third]
              : table === 'categories'
                ? [{ id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }]
                : [],
          error: null,
        });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    const error = await confirmPendingItems({
      userId: FIXTURE_USER,
      itemIds: [FIXTURE_ITEM, secondId, thirdId],
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PendingBatchConfirmError);
    const batch = error as PendingBatchConfirmError;
    expect(batch.items[2]).toEqual({ pendingId: thirdId, status: 'reverted' });
    expect(updates.some((u) => u.table === 'pending_inbox_items' && u.value.status === 'uncertain')).toBe(
      true
    );
  });

  it('recovers a stale confirming item with a null claim id on the batch path', async () => {
    const stale = itemRow('confirming', {
      claim_id: null,
      updated_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    });
    expect(isStaleConfirming(stale)).toBe(true);
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'claim_pending_inbox_items') {
        return { data: [itemRow('confirming')], error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
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
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') return { data: null, error: null };
        if (table === 'categories') {
          return { data: { id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }, error: null };
        }
        return { data: itemRow('confirmed'), error: null };
      };
      q.single = async () => ({ data: { id: FIXTURE_USER, default_currency: 'ARS' }, error: null });
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data:
            table === 'pending_inbox_items'
              ? [stale]
              : table === 'categories'
                ? [{ id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }]
                : [],
          error: null,
        });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    const confirmed = await confirmPendingItems({ userId: FIXTURE_USER, itemIds: [FIXTURE_ITEM] });
    expect(confirmed).toHaveLength(1);
    expect(mocks.rpc.mock.calls.some((call: unknown[]) => call[0] === 'claim_pending_inbox_items')).toBe(
      true
    );
    expect(updates.some((u) => u.table === 'pending_inbox_items' && u.value.status === 'pending')).toBe(
      true
    );
  });

  it('does not count idempotent ledger recovery in executedCount', async () => {
    mocks.rpc.mockImplementation(async (fn: string) => {
      if (fn === 'claim_pending_inbox_items') {
        return { data: [itemRow('confirming')], error: null };
      }
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
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
      q.maybeSingle = async () => {
        if (table === 'transaction_requests') {
          return { data: { response: { id: 'tx-existing' } }, error: null };
        }
        if (table === 'categories') {
          return { data: { id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }, error: null };
        }
        return { data: itemRow('confirmed'), error: null };
      };
      q.single = async () => ({ data: { id: FIXTURE_USER, default_currency: 'ARS' }, error: null });
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve({
          data:
            table === 'pending_inbox_items'
              ? [itemRow('uncertain')]
              : table === 'categories'
                ? [{ id: CATEGORY_ID, user_id: FIXTURE_USER, is_system: false }]
                : [],
          error: null,
        });
      q.upsert = async () => ({ data: null, error: null });
      return q;
    });
    const confirmed = await confirmPendingItems({ userId: FIXTURE_USER, itemIds: [FIXTURE_ITEM] });
    expect(confirmed).toHaveLength(1);
    expect(confirmed.executedCount).toBe(0);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
