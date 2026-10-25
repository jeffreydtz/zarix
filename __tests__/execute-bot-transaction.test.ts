import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeBotTransaction } from '@/lib/telegram/executeBotTransaction';
import type { FinancialContext } from '@/lib/ai/prompts';

const FIXTURE_USER = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const DEST_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa8';
const SYSTEM_CATEGORY_ID = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  peek: vi.fn(),
  getExchangeRate: vi.fn(async (_from?: string, _to?: string) => 1),
}));

vi.mock('@/lib/services/transactions', () => ({
  transactionsService: {
    create: (...args: unknown[]) => mocks.create(...args),
    peekDurableRequest: (...args: unknown[]) => mocks.peek(...args),
  },
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
    mocks.create.mockReset();
    mocks.peek.mockReset();
    mocks.getExchangeRate.mockReset();
    mocks.create.mockResolvedValue({ id: 'tx-1', amount: 1250, currency: 'ARS' });
    mocks.peek.mockResolvedValue(null);
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
    const { transactionRequestHash } = await import('@/lib/transaction-idempotency');
    mocks.getExchangeRate.mockResolvedValueOnce(100);
    mocks.create.mockResolvedValueOnce({ id: 'tx-1', amount: 1000, currency: 'ARS' });
    const payload = {
      type: 'expense' as const,
      amount: 10,
      currency: 'USD',
      accountId: ACCOUNT_ID,
      description: 'USD on ARS card',
    };
    const first = await executeBotTransaction(FIXTURE_USER, financialContext, payload, { requestId: 'fx-retry-001' });
    expect(first.kind).toBe('success');
    expect((first as { executed?: { amount: number } }).executed?.amount).toBe(1000);
    const intent = (mocks.create.mock.calls[0][0] as { idempotencyIntent: Record<string, unknown> }).idempotencyIntent;
    expect(intent).toMatchObject({ amount: 10, currency: 'USD', type: 'expense' });
    mocks.peek.mockResolvedValueOnce({
      request_hash: transactionRequestHash(intent),
      response: { id: 'tx-1', amount: 1000, currency: 'ARS' },
    });
    mocks.getExchangeRate.mockResolvedValueOnce(200);
    const second = await executeBotTransaction(FIXTURE_USER, financialContext, payload, { requestId: 'fx-retry-001' });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.getExchangeRate).toHaveBeenCalledTimes(1);
    expect(second.kind).toBe('success');
    expect((second as { executed?: { amount: number; currency: string }; reply: string }).executed?.amount).toBe(1000);
    expect((second as { executed?: { currency: string } }).executed?.currency).toBe('ARS');
    expect((second as { reply: string }).reply).toMatch(/1000/);
    expect((second as { reply: string }).reply).not.toMatch(/2000/);
  });

  it('builds concurrent-replay reply amounts from the persisted transaction, not this attempt FX', async () => {
    mocks.peek.mockResolvedValue(null);
    mocks.getExchangeRate.mockResolvedValue(200);
    mocks.create.mockResolvedValue({ id: 'tx-1', amount: 1000, currency: 'ARS' });
    const result = await executeBotTransaction(
      FIXTURE_USER,
      financialContext,
      {
        type: 'expense',
        amount: 10,
        currency: 'USD',
        accountId: ACCOUNT_ID,
        description: 'USD on ARS card',
      },
      { requestId: 'fx-race-001' }
    );
    expect(result.kind).toBe('success');
    const success = result as { reply: string; executed?: { amount: number; currency: string } };
    expect(success.executed?.amount).toBe(1000);
    expect(success.executed?.currency).toBe('ARS');
    expect(success.reply).toMatch(/1000/);
    expect(success.reply).not.toMatch(/2000/);
    expect(success.reply).not.toMatch(/\$200\.00/);
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
