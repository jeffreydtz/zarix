import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  summary: vi.fn(),
  status: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}));

vi.mock('@/lib/services/transactions', () => ({
  transactionsService: { getMonthSummary: mocks.summary },
}));

vi.mock('@/lib/services/budgets', () => ({
  budgetsService: { getStatus: mocks.status },
}));

import { GET as summaryGet } from '@/app/api/transactions/summary/route';
import { GET as budgetStatusGet } from '@/app/api/budgets/status/route';

const USER = { id: '11111111-1111-4111-8111-111111111111' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: USER }, error: null });
  mocks.summary.mockResolvedValue({ totalExpenses: 0 });
  mocks.status.mockResolvedValue([]);
});

describe('invalid ?month= is 400, not the current month', () => {
  it.each(['', 'nope', '2026-13'])(
    'returns 400 from transactions/summary for month=%s',
    async (month) => {
      const res = await summaryGet(
        new NextRequest(`http://localhost/api/transactions/summary?month=${encodeURIComponent(month)}`)
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: expect.stringMatching(/Mes inválido/i) });
      expect(mocks.summary).not.toHaveBeenCalled();
    }
  );

  it.each(['', 'nope', '2026-13'])(
    'returns 400 from budgets/status for month=%s',
    async (month) => {
      const res = await budgetStatusGet(
        new NextRequest(`http://localhost/api/budgets/status?month=${encodeURIComponent(month)}`)
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: expect.stringMatching(/Mes inválido/i) });
      expect(mocks.status).not.toHaveBeenCalled();
    }
  );

  it('treats YYYY-MM as Córdoba noon on day 1 for both routes', async () => {
    const summary = await summaryGet(
      new NextRequest('http://localhost/api/transactions/summary?month=2026-10')
    );
    const status = await budgetStatusGet(
      new NextRequest('http://localhost/api/budgets/status?month=2026-10')
    );
    expect(summary.status).toBe(200);
    expect(status.status).toBe(200);
    expect(mocks.summary.mock.calls[0][1].toISOString()).toBe('2026-10-01T15:00:00.000Z');
    expect(mocks.status.mock.calls[0][1].toISOString()).toBe('2026-10-01T15:00:00.000Z');
    expect(mocks.status.mock.calls[0][1].getTime()).not.toBe(new Date('2026-10').getTime());
  });

  it('uses the current month when month is omitted', async () => {
    const res = await summaryGet(new NextRequest('http://localhost/api/transactions/summary'));
    expect(res.status).toBe(200);
    expect(mocks.summary).toHaveBeenCalledTimes(1);
    expect(mocks.summary.mock.calls[0][1]).toBeInstanceOf(Date);
  });
});
