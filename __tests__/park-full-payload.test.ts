import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  park: vi.fn(),
  confirm: vi.fn(),
  confirmMany: vi.fn(),
  createTx: vi.fn(),
  listTx: vi.fn(),
  getTx: vi.fn(),
  deleteTx: vi.fn(),
  listAccounts: vi.fn(),
  createAccount: vi.fn(),
}));

vi.mock('@/lib/services/pending-inbox', () => ({
  parkRegistryWrite: (...args: unknown[]) => mocks.park(...args),
  confirmPendingItem: (...args: unknown[]) => mocks.confirm(...args),
  confirmPendingItems: (...args: unknown[]) => mocks.confirmMany(...args),
}));

vi.mock('@/lib/telegram/executeBotTransaction', () => ({
  executeBotTransaction: (...args: unknown[]) => mocks.createTx(...args),
}));

vi.mock('@/lib/services/transactions', () => ({
  transactionsService: {
    list: (...args: unknown[]) => mocks.listTx(...args),
    getById: (...args: unknown[]) => mocks.getTx(...args),
    delete: (...args: unknown[]) => mocks.deleteTx(...args),
  },
}));

vi.mock('@/lib/services/accounts', () => ({
  accountsService: {
    list: (...args: unknown[]) => mocks.listAccounts(...args),
    create: (...args: unknown[]) => mocks.createAccount(...args),
    findByNameFuzzy: async () => ({ account: null, confidence: 'none' }),
  },
}));

import { executeRegistryTool } from '@/lib/ai/registry/execute';

const FIXTURE_USER = '11111111-1111-4111-8111-111111111111';
const ctx = {
  userId: FIXTURE_USER,
  financialContext: {
    user: { default_currency: 'ARS' },
    accounts: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', name: 'Banco', currency: 'ARS', type: 'bank', is_active: true }],
    categories: [],
  } as never,
  source: 'mcp' as const,
  allowedScopes: ['read', 'write'] as const,
  requestId: 'idem-park-fixture-001',
};

describe('MCP/REST park keeps full payload and consumes pendingIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.park.mockImplementation(async (input: { toolPayload?: { type?: string } }) => ({
      id: `pending-${input.toolPayload?.type || 'x'}`,
      tool_payload: input.toolPayload,
    }));
    mocks.confirm.mockResolvedValue({ id: 'pending-expense', merchant: 'Café' });
    mocks.confirmMany.mockResolvedValue([{ id: 'p1' }, { id: 'p2' }]);
    mocks.listAccounts.mockResolvedValue([{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', name: 'Banco', currency: 'ARS' }]);
  });

  it('parks income, transfer and expense with type/destination/account and confirms that payload', async () => {
    const income = await executeRegistryTool(
      'create_transaction',
      { type: 'income', amount: 1000, account: 'Banco', description: 'Sueldo' },
      ctx
    );
    expect(income.response.needs_confirm).toBe(true);
    expect(mocks.park.mock.calls[0][0].toolPayload).toMatchObject({ type: 'income', amount: 1000, account: 'Banco' });

    const transfer = await executeRegistryTool(
      'create_transaction',
      { type: 'transfer', amount: 500, account: 'Banco', destinationAccount: 'Efectivo' },
      ctx
    );
    expect(mocks.park.mock.calls[1][0].toolPayload).toMatchObject({
      type: 'transfer',
      destinationAccount: 'Efectivo',
      account: 'Banco',
    });

    const expense = await executeRegistryTool(
      'create_transaction',
      { type: 'expense', amount: 250, category: 'Comida', accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1' },
      ctx
    );
    expect(mocks.park.mock.calls[2][0].toolPayload).toMatchObject({ type: 'expense', category: 'Comida' });
    expect(expense.response.pendingId).toBeTruthy();

    const confirmed = await executeRegistryTool(
      'create_transaction',
      { type: 'income', amount: 1000, confirm: true, pendingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9' },
      ctx
    );
    expect(confirmed.response.success).toBe(true);
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9' }));
    expect(mocks.createTx).not.toHaveBeenCalled();
  });

  it('refuses confirm=true without pendingIds and does not write the ledger', async () => {
    const single = await executeRegistryTool(
      'create_transaction',
      { type: 'expense', amount: 10, confirm: true },
      ctx
    );
    expect(single.response.success).toBe(false);
    expect(String(single.response.error)).toMatch(/pendingId/i);
    expect(mocks.createTx).not.toHaveBeenCalled();

    const batch = await executeRegistryTool(
      'create_transactions',
      { transactions: [{ type: 'expense', amount: 10 }, { type: 'expense', amount: 20 }], confirm: true },
      ctx
    );
    expect(batch.response.success).toBe(false);
    expect(mocks.createTx).not.toHaveBeenCalled();
  });

  it('binds delete to the previewed transaction id, not whatever is last later', async () => {
    const first = { id: 'tx-preview', type: 'expense', amount: 10, currency: 'ARS', description: 'Café', account: { name: 'Banco' } };
    mocks.listTx.mockResolvedValue([first]);
    const preview = await executeRegistryTool('delete_last_transaction', {}, ctx);
    expect(preview.response.needs_confirm).toBe(true);
    expect((preview.response.preview as { transactionId: string }).transactionId).toBe('tx-preview');
    expect(mocks.park.mock.calls[0][0].toolPayload.transactionId).toBe('tx-preview');

    mocks.listTx.mockResolvedValue([{ id: 'tx-newer', type: 'expense', amount: 99, currency: 'ARS', description: 'Otro' }]);
    await executeRegistryTool(
      'delete_last_transaction',
      { confirm: true, pendingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9' },
      ctx
    );
    expect(mocks.confirm).toHaveBeenCalled();
    expect(mocks.deleteTx).not.toHaveBeenCalled();
  });

  it('parks create_account, create_recurring and edit with the full payload and requestId', async () => {
    await executeRegistryTool('create_account', { name: 'Efectivo', type: 'cash' }, ctx);
    expect(mocks.park.mock.calls[0][0].toolPayload).toMatchObject({
      _tool: 'create_account',
      name: 'Efectivo',
      type: 'cash',
    });
    expect(mocks.park.mock.calls[0][0].ingestKey).toBe(ctx.requestId);

    mocks.park.mockClear();
    await executeRegistryTool(
      'create_recurring',
      { description: 'Alquiler', amount: 1000, frequency: 'monthly', type: 'expense' },
      ctx
    );
    expect(mocks.park.mock.calls[0][0].toolPayload).toMatchObject({
      _tool: 'create_recurring',
      description: 'Alquiler',
      frequency: 'monthly',
    });

    mocks.listTx.mockResolvedValue([
      { id: 'tx-edit', type: 'expense', amount: 10, currency: 'ARS', description: 'Café', account: { name: 'Banco' } },
    ]);
    mocks.park.mockClear();
    await executeRegistryTool('edit_last_transaction', { amount: 50, description: 'Cena' }, ctx);
    expect(mocks.park.mock.calls[0][0].toolPayload).toMatchObject({
      _tool: 'edit_last_transaction',
      transactionId: 'tx-edit',
      amount: 50,
    });
  });

  it('rethrows 409 when the same Idempotency-Key is reused with a different body', async () => {
    const { ApiError } = await import('@/lib/api-handler');
    mocks.park.mockRejectedValue(new ApiError('Esa Idempotency-Key ya se usó con otro cuerpo.', 409));
    await expect(
      executeRegistryTool(
        'create_transaction',
        { type: 'expense', amount: 20, description: 'Otro' },
        ctx
      )
    ).rejects.toMatchObject({ status: 409 });
  });
});
