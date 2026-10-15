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
  mocks.aggregateAccounts.mockReturnValue({ liquidUSD: 100, investmentsUSD: 0, totalUSD: 100, totalARSBlue: 120000 });
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
    mocks.aggregateAccounts.mockReturnValue({ liquidUSD: 100, investmentsUSD: 0, totalUSD: 100, totalARSBlue: 120000, valuation });
    await expect(computeNetWorth('user-A')).resolves.toMatchObject({ totalARSBlue: 180000, valuation });
    await expect(recordNetWorthSnapshot('user-A')).resolves.toBe(false);
    expect(mocks.accounts).toHaveBeenCalledWith('user-A', { allowPartialValuation: true });
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalledWith('net_worth_snapshots');
  });
  it.each(['accounts', 'portfolio'] as const)('does not overwrite a snapshot when %s fails despite a valid blue rate', async component => {
    const failure = new Error(`${component} unavailable`);
    mocks[component].mockRejectedValue(failure);

    await expect(computeNetWorth('user-A')).rejects.toBe(failure);
    await expect(recordNetWorthSnapshot('user-A')).resolves.toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalledWith('net_worth_snapshots');
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
