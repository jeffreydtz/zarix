import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveToolPeriod } from '@/lib/tool-period';
import { ymdToQueryExclusiveEndIso, ymdToQueryStartIso } from '@/lib/transaction-date';

const mocks = vi.hoisted(() => ({
  breakdown: vi.fn(),
}));

vi.mock('@/lib/services/analytics', () => ({
  analyticsService: {
    getCategoryBreakdown: (...args: unknown[]) => mocks.breakdown(...args),
  },
}));

import { executeRegistryTool } from '@/lib/ai/registry/execute';

describe('Córdoba tool period bounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.breakdown.mockResolvedValue([{ name: 'Sintético', amount: 10, count: 1, icon: 'x', percent: 100, color: '#000' }]);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('last_month in October is 1 Sep inclusive through 1 Oct exclusive', () => {
    const period = resolveToolPeriod('last_month', '2026-10-15');
    expect(period.startYmd).toBe('2026-09-01');
    expect(period.endYmd).toBe('2026-09-30');
    expect(period.startIso).toBe(ymdToQueryStartIso('2026-09-01'));
    expect(period.exclusiveEndIso).toBe(ymdToQueryExclusiveEndIso('2026-09-30'));
    expect(period.exclusiveEndIso).toBe('2026-10-01T03:00:00.000Z');
    const sep10 = new Date('2026-09-10T12:00:00-03:00').toISOString();
    const oct1 = new Date('2026-10-01T20:00:00-03:00').toISOString();
    expect(sep10 >= period.startIso && sep10 < period.exclusiveEndIso).toBe(true);
    expect(oct1 >= period.startIso && oct1 < period.exclusiveEndIso).toBe(false);
  });

  it('get_spending(last_month) in October queries September only', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-15T15:00:00.000Z'));
    const result = await executeRegistryTool(
      'get_spending',
      { period: 'last_month' },
      {
        userId: '11111111-1111-4111-8111-111111111111',
        financialContext: { user: { default_currency: 'ARS' }, accounts: [], categories: [] } as never,
        source: 'web',
      }
    );
    expect(mocks.breakdown).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      '2026-09-01',
      '2026-09-30',
      'expense'
    );
    expect(result.response.total).toBe(10);
  });
});
