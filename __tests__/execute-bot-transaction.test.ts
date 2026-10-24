import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeBotTransaction } from '@/lib/telegram/executeBotTransaction';
import type { FinancialContext } from '@/lib/ai/prompts';

const FIXTURE_USER = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const DEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8';
const SYSTEM_CATEGORY_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('@/lib/services/transactions', () => ({
  transactionsService: { create: (...args: unknown[]) => mocks.create(...args) },
}));

vi.mock('@/lib/services/accounts', () => ({
  accountsService: {
    list: async () => [],
    findByNameFuzzy: async () => ({ account: null }),
  },
}));

vi.mock('@/lib/services/cotizaciones', () => ({
  cotizacionesService: { getExchangeRate: async () => 1 },
}));

const financialContext = {
  user: { id: FIXTURE_USER, default_currency: 'ARS' },
  accounts: [
    {
      id: ACCOUNT_ID,
      user_id: FIXTURE_USER,
      name: 'Visa Ejemplo',
      currency: 'ARS',
      type: 'credit_card',
      is_active: true,
      is_multicurrency: false,
    },
    {
      id: DEST_ID,
      user_id: FIXTURE_USER,
      name: 'Efectivo',
      currency: 'ARS',
      type: 'cash',
      is_active: true,
      is_multicurrency: false,
    },
  ],
  categories: [
    {
      id: SYSTEM_CATEGORY_ID,
      user_id: null,
      name: 'Comida',
      type: 'expense',
      icon: '🍔',
      parent_id: null,
      is_system: true,
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ],
} as unknown as FinancialContext;

describe('executeBotTransaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ id: 'tx-1' });
  });

  it('keeps a NULL-owner system categoryId on create', async () => {
    const result = await executeBotTransaction(FIXTURE_USER, financialContext, {
      type: 'expense',
      amount: 1250,
      accountId: ACCOUNT_ID,
      categoryId: SYSTEM_CATEGORY_ID,
      description: 'Café',
    });
    expect(result.kind).toBe('success');
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryId: SYSTEM_CATEGORY_ID,
        accountId: ACCOUNT_ID,
        amount: 1250,
      })
    );
  });

  it('forwards installments and destinationAccountId', async () => {
    await executeBotTransaction(FIXTURE_USER, financialContext, {
      type: 'expense',
      amount: 1200,
      accountId: ACCOUNT_ID,
      installments: 12,
      description: 'Cuotas',
    });
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ installments: 12 });

    await executeBotTransaction(FIXTURE_USER, financialContext, {
      type: 'transfer',
      amount: 500,
      accountId: ACCOUNT_ID,
      destinationAccountId: DEST_ID,
      description: 'Move',
    });
    expect(mocks.create.mock.calls[1][0]).toMatchObject({
      type: 'transfer',
      destinationAccountId: DEST_ID,
    });
  });
});
