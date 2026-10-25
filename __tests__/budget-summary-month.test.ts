import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  from: vi.fn(),
  months: [] as string[],
}));

vi.mock('@/lib/services/budgets', () => ({ budgetsService: { getStatus: mocks.status } }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({ from: mocks.from }) }));

import { getTopBudgets } from '@/lib/services/budget-summary';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.months.length = 0;
  mocks.status.mockResolvedValue([{ category_id: 'category-A', spent_amount: 800, remaining_amount: 200, percent_used: 80 }]);
  mocks.from.mockImplementation((table: string) => {
    if (table !== 'budgets') throw new Error(`unexpected table ${table}`);
    return {
      select: () => ({
        eq: () => ({
          eq: async (_column: string, month: string) => {
            mocks.months.push(month);
            return {
              data: [{ id: 'budget-A', category_id: 'category-A', amount: 1000, currency: 'ARS', category: { name: 'Food', icon: 'F' } }],
              error: null,
            };
          },
        }),
      }),
    };
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('dashboard budget summary uses the Córdoba civil month', () => {
  it.each([
    ['2026-10-01T00:00:00.000Z', '2026-09-01'],
    ['2026-10-01T03:00:00.000Z', '2026-10-01'],
    ['2026-11-01T02:59:59.000Z', '2026-10-01'],
    ['2026-11-01T03:00:00.000Z', '2026-11-01'],
  ])('at %s fetches budgets and status for %s', async (now, month) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    await getTopBudgets('user-A');
    expect(mocks.months).toEqual([month]);
    expect(mocks.status).toHaveBeenCalledWith('user-A', month);
    expect(mocks.status.mock.calls[0][1]).not.toBeInstanceOf(Date);
  });
});
