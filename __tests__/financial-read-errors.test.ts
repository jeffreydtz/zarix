import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  accounts: vi.fn(),
  aggregateAccounts: vi.fn(),
  portfolio: vi.fn(),
  quotes: vi.fn(),
  status: vi.fn(),
  from: vi.fn(),
  upsert: vi.fn(),
  budgetRows: [] as Array<{ id: string; category_id: string | null; amount: number; currency: string; category: { name: string; icon: string } | null }>,
}));

vi.mock('@/lib/services/accounts', () => ({ accountsService: {
  list: mocks.accounts, aggregateAccountTotals: mocks.aggregateAccounts,
} }));
vi.mock('@/lib/services/investments', () => ({ investmentsService: { getPortfolioSummary: mocks.portfolio } }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: { getDolarQuotes: mocks.quotes } }));
vi.mock('@/lib/services/budgets', () => ({ budgetsService: { getStatus: mocks.status } }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from: mocks.from }) }));

import { computeNetWorth, recordNetWorthSnapshot } from '@/lib/services/net-worth';
import { getTopBudgets } from '@/lib/services/budget-summary';

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.accounts.mockResolvedValue([{ id: 'account-A' }]);
  mocks.aggregateAccounts.mockReturnValue({
    liquidUSD: 100, liquidARSBlue: 120000, investmentsUSD: 0, totalUSD: 100, totalARSBlue: 120000,
    availableUSD: 100, availableARSBlue: 120000, creditCardDebtUSD: 0, creditCardDebtARSBlue: 0, creditCards: [],
  });
  mocks.portfolio.mockResolvedValue({ totalCurrentValue: 50, totalCurrentValueArsBlue: 60000, investments: [] });
  mocks.quotes.mockResolvedValue({ blue: { buy: 1200, sell: 1200 } });
  mocks.upsert.mockResolvedValue({ error: null });
  mocks.budgetRows = [{ id: 'budget-A', category_id: 'category-A', amount: 100, currency: 'ARS', category: { name: 'Food', icon: 'F' } }];
  mocks.from.mockImplementation((table: string) => {
    if (table === 'net_worth_snapshots') return { upsert: mocks.upsert };
    if (table === 'budgets') return {
      select: () => ({ eq: () => ({ eq: async () => ({
        data: mocks.budgetRows,
        error: null,
      }) }) }),
    };
    throw new Error('Unexpected mocked table');
  });
});

afterEach(() => vi.restoreAllMocks());

describe('Financial read failures keep unavailable data distinct from zero', () => {
  it('does not overwrite a complete snapshot with an explicitly partial known subtotal', async () => {
    const valuation = { status: 'partial', excludedAccounts: [{ accountId: 'legacy', name: 'Legacy', currency: 'ZZZ', balance: 10, currencies: ['ZZZ'], reason: 'unsupported_currency' }] };
    mocks.aggregateAccounts.mockReturnValue({
      liquidUSD: 100, liquidARSBlue: 120000, investmentsUSD: 0, totalUSD: 100, totalARSBlue: 120000,
      availableUSD: 100, availableARSBlue: 120000, creditCardDebtUSD: 0, creditCardDebtARSBlue: 0, creditCards: [],
      valuation,
    });
    await expect(computeNetWorth('user-A')).resolves.toMatchObject({ totalARSBlue: 120000, investmentsUSD: 50, valuation });
    await expect(recordNetWorthSnapshot('user-A')).resolves.toBe(false);
    expect(mocks.accounts).toHaveBeenCalledWith('user-A', { allowPartialValuation: true });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalledWith('net_worth_snapshots');
  });
  it('still writes a zero snapshot when no accounts remain if blue is available', async () => {
    mocks.accounts.mockResolvedValue([]);
    mocks.quotes.mockResolvedValue({ blue: { buy: 1280, sell: 1300 } });
    await expect(computeNetWorth('user-A')).resolves.toMatchObject({
      totalUSD: 0, totalARSBlue: 0, liquidUSD: 0, blueRate: 1300, investmentsUSD: 50,
    });
    await expect(recordNetWorthSnapshot('user-A')).resolves.toBe(true);
    expect(mocks.quotes).toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      liquid_usd: 0, total_usd: 0, blue_ars_per_usd: 1300,
    }), expect.anything());
  });

  it.each(['accounts', 'portfolio'] as const)('does not overwrite a snapshot when %s fails despite a valid blue rate', async component => {
    const failure = new Error(`${component} unavailable`);
    mocks[component].mockRejectedValue(failure);

    await expect(computeNetWorth('user-A')).rejects.toBe(failure);
    await expect(recordNetWorthSnapshot('user-A')).resolves.toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalledWith('net_worth_snapshots');
  });

  it('flags unavailable FX and never records an incomplete account valuation', async () => {
    mocks.aggregateAccounts.mockReturnValue({
      liquidUSD: 0, liquidARSBlue: 0, investmentsUSD: 0, investmentsARSBlue: 0,
      availableUSD: 0, availableARSBlue: 0, creditCardDebtUSD: 0, creditCardDebtARSBlue: 0,
      creditCards: [], fxUnavailable: true,
    });
    mocks.quotes.mockResolvedValue({ status: 'unavailable', missing: ['blue'] });
    await expect(computeNetWorth('user-A')).resolves.toMatchObject({ fxUnavailable: true, blueRate: null });
    await expect(recordNetWorthSnapshot('user-A')).resolves.toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('keeps the last-known date and skips snapshots during a stale FX fallback', async () => {
    const asOf = new Date('2026-10-23T16:00:00Z');
    mocks.quotes.mockResolvedValue({ blue: { buy: 1280, sell: 1300, stale: true, asOf } });
    await expect(computeNetWorth('user-A')).resolves.toMatchObject({
      fxStale: true, fxAsOf: asOf.toISOString(), blueRate: 1300,
    });
    await expect(recordNetWorthSnapshot('user-A')).resolves.toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('does not replace unavailable portfolio values with a zero snapshot', async () => {
    mocks.portfolio.mockResolvedValue({
      totalCurrentValue: null, totalCurrentValueArsBlue: null, investments: [{ id: 'position-A' }], fxUnavailable: true,
    });
    await expect(computeNetWorth('user-A')).resolves.toMatchObject({ investmentsUSD: null, positionsUSD: null });
    await expect(recordNetWorthSnapshot('user-A')).resolves.toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('propagates an unavailable budget status instead of returning zero spending for an existing budget', async () => {
    const failure = new Error('Budget status unavailable');
    mocks.status.mockRejectedValue(failure);

    await expect(getTopBudgets('user-A')).rejects.toBe(failure);
    expect(mocks.status).toHaveBeenCalledOnce();
  });

  it('preserves positive spending returned for an uncategorized budget', async () => {
    mocks.budgetRows = [{ id: 'budget-uncategorized', category_id: null, amount: 100, currency: 'ARS', category: null }];
    mocks.status.mockResolvedValue([{ category_id: null, spent_amount: 30, remaining_amount: 70, percent_used: 30 }]);

    await expect(getTopBudgets('user-A')).resolves.toEqual([{
      id: 'budget-uncategorized', categoryId: null, name: 'Sin categoría', icon: '📦',
      limitAmount: 100, spentAmount: 30, remainingAmount: 70, percentUsed: 30, currency: 'ARS',
    }]);
  });
});
