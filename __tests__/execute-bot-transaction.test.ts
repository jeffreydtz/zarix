import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeBotTransaction } from '@/lib/telegram/executeBotTransaction';
import type { FinancialContext } from '@/lib/ai/prompts';

const FIXTURE_USER = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const DEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8';
const SYSTEM_CATEGORY_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  getExchangeRate: vi.fn(async (_from?: string, _to?: string) => 1),
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
  cotizacionesService: {
    getExchangeRate: (from: string, to?: string) => mocks.getExchangeRate(from, to),
  },
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
    mocks.getExchangeRate.mockResolvedValue(1);
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

  it('looks up retries from the original amount before credit-card FX', async () => {
    mocks.getExchangeRate.mockResolvedValueOnce(100);
    const payload = {
      type: 'expense' as const,
      amount: 10,
      currency: 'USD',
      accountId: ACCOUNT_ID,
      description: 'USD on ARS card',
    };
    await executeBotTransaction(FIXTURE_USER, financialContext, payload, { requestId: 'fx-retry-001' });
    mocks.getExchangeRate.mockResolvedValueOnce(200);
    await executeBotTransaction(FIXTURE_USER, financialContext, payload, { requestId: 'fx-retry-001' });
    expect(mocks.create).toHaveBeenCalledTimes(2);
    const first = mocks.create.mock.calls[0][0] as { amount: number; currency: string; idempotencyIntent: Record<string, unknown> };
    const second = mocks.create.mock.calls[1][0] as { amount: number; currency: string; idempotencyIntent: Record<string, unknown> };
    expect(first.amount).toBe(1000);
    expect(second.amount).toBe(2000);
    expect(first.idempotencyIntent).toMatchObject({ amount: 10, currency: 'USD', type: 'expense' });
    expect(second.idempotencyIntent).toEqual(first.idempotencyIntent);
  });

  it('aborts an explicit unsupported currency instead of coercing to ARS', async () => {
    const result = await executeBotTransaction(FIXTURE_USER, financialContext, {
      type: 'expense',
      amount: 10,
      currency: 'GBP',
      accountId: ACCOUNT_ID,
    });
    expect(result.kind).toBe('abort');
    expect(String((result as { reply: string }).reply)).toMatch(/Moneda no admitida/);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('aborts a credit-card FX conversion when executable FX is unavailable', async () => {
    const { FxUnavailableError } = await import('@/lib/executable-fx');
    mocks.getExchangeRate.mockRejectedValue(new FxUnavailableError('USD→ARS'));
    const result = await executeBotTransaction(FIXTURE_USER, financialContext, {
      type: 'expense',
      amount: 10,
      currency: 'USD',
      accountId: ACCOUNT_ID,
      description: 'USD on ARS card',
    });
    expect(result).toEqual({ kind: 'abort', reply: 'Cotización USD→ARS no disponible, inválida o vencida' });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
