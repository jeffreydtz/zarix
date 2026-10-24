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
import { createTransactionSchema } from '@/lib/ai/registry/schemas';

const FIXTURE_USER = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const DEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8';
const PENDING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9';

const ctx = {
  userId: FIXTURE_USER,
  financialContext: {
    user: { default_currency: 'ARS' },
    accounts: [{ id: ACCOUNT_ID, name: 'Banco', currency: 'ARS', type: 'bank', is_active: true }],
    categories: [],
  } as never,
  source: 'mcp' as const,
  allowedScopes: ['read', 'write'] as const,
  requestId: 'idem-park-fixture-001',
  canConfirmRemote: true,
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
    mocks.listAccounts.mockResolvedValue([{ id: ACCOUNT_ID, name: 'Banco', currency: 'ARS' }]);
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
      { type: 'expense', amount: 250, category: 'Comida', accountId: ACCOUNT_ID },
      ctx
    );
    expect(mocks.park.mock.calls[2][0].toolPayload).toMatchObject({ type: 'expense', category: 'Comida' });
    expect(expense.response.pendingId).toBeTruthy();

    const confirmed = await executeRegistryTool(
      'create_transaction',
      { confirm: true, pendingId: PENDING_ID },
      ctx
    );
    expect(confirmed.response.success).toBe(true);
    expect(mocks.confirm).toHaveBeenCalledWith(expect.objectContaining({ itemId: PENDING_ID }));
    expect(mocks.confirm.mock.calls[0][0].amount).toBeUndefined();
    expect(mocks.createTx).not.toHaveBeenCalled();
  });

  it('keeps installments and destinationAccountId through the schema and park', async () => {
    await executeRegistryTool(
      'create_transaction',
      { type: 'expense', amount: 1200, accountId: ACCOUNT_ID, installments: 12 },
      ctx
    );
    expect(mocks.park.mock.calls[0][0].toolPayload).toMatchObject({ installments: 12, amount: 1200 });

    mocks.park.mockClear();
    await executeRegistryTool(
      'create_transaction',
      { type: 'transfer', amount: 500, accountId: ACCOUNT_ID, destinationAccountId: DEST_ID },
      ctx
    );
    expect(mocks.park.mock.calls[0][0].toolPayload).toMatchObject({
      type: 'transfer',
      destinationAccountId: DEST_ID,
    });
  });

  it('rejects a frozen confirm that tries to change amount or account, and does not write', async () => {
    await expect(
      executeRegistryTool(
        'create_transaction',
        {
          confirm: true,
          pendingId: PENDING_ID,
          amount: 999999,
          accountId: DEST_ID,
          type: 'expense',
        },
        ctx
      )
    ).rejects.toMatchObject({ status: 400 });
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.createTx).not.toHaveBeenCalled();
  });

  it('refuses remote confirm without write:confirm', async () => {
    await expect(
      executeRegistryTool(
        'create_transaction',
        { confirm: true, pendingId: PENDING_ID },
        { ...ctx, canConfirmRemote: false }
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('refuses confirm=true without pendingIds and does not write the ledger', async () => {
    const single = await executeRegistryTool(
      'create_transaction',
      { confirm: true },
      ctx
    );
    expect(single.response.success).toBe(false);
    expect(String(single.response.error)).toMatch(/pendingId/i);
    expect(mocks.createTx).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();

    const batch = await executeRegistryTool(
      'create_transactions',
      { confirm: true },
      ctx
    );
    expect(batch.response.success).toBe(false);
    expect(mocks.createTx).not.toHaveBeenCalled();
    expect(mocks.confirmMany).not.toHaveBeenCalled();
  });

  it('hides delete, edit, account and recurring from the MCP/REST write surface', async () => {
    for (const name of ['delete_last_transaction', 'edit_last_transaction', 'create_account', 'create_recurring']) {
      const result = await executeRegistryTool(name, { confirm: true, pendingId: PENDING_ID, name: 'X', description: 'Alquiler', amount: 10, frequency: 'monthly' }, ctx);
      expect(result.response.success).toBe(false);
      expect(String(result.response.error)).toMatch(/no está disponible/i);
    }
    expect(mocks.park).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.createTx).not.toHaveBeenCalled();
  });

  it('uses the header requestId over a body requestId', async () => {
    await executeRegistryTool(
      'create_transaction',
      { type: 'expense', amount: 10, requestId: 'body-key-fixture' },
      { ...ctx, requestId: 'header-key-fixture' }
    );
    expect(mocks.park.mock.calls[0][0].ingestKey).toBe('header-key-fixture');
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

  it('keeps 12 installments and a transfer destination in the Zod schema', () => {
    expect(
      createTransactionSchema.parse({ type: 'expense', amount: 1200, installments: 12 }).installments
    ).toBe(12);
    expect(
      createTransactionSchema.parse({
        type: 'transfer',
        amount: 500,
        destinationAccountId: DEST_ID,
      }).destinationAccountId
    ).toBe(DEST_ID);
  });
});
