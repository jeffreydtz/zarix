import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { PortfolioSummaryPayload } from '@/lib/services/investments';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  upsert: vi.fn(),
  netWorth: vi.fn(),
  portfolio: vi.fn(),
}));

vi.mock('@/lib/observability/alert', () => ({
  alertAdmin: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/supabase/server', () => ({
  createServiceClientSync: () => ({ from: mocks.from }),
}));
vi.mock('@/lib/services/net-worth', () => ({
  recordNetWorthSnapshot: mocks.netWorth,
}));

import { investmentsService } from '@/lib/services/investments';
import { GET as netWorthSnapshotGet } from '@/app/api/cron/net-worth-snapshot/route';

const readySummary = {
  fxUnavailable: false,
  fxStale: false,
  totalPurchaseValue: 100,
  totalCurrentValue: 120,
  totalPnL: 20,
  totalPnLPercent: 20,
  blueArsPerUsd: 1300,
} as PortfolioSummaryPayload;

function usersQuery(ids: string[]) {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve({ data: ids.map((id) => ({ id })), error: null }).then(resolve, reject);
  return query;
}

describe('recordDailySnapshotForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'portfolio_performance_snapshots') return { upsert: mocks.upsert };
      throw new Error(`Unexpected table ${table}`);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('upserts once per user per day when FX is executable', async () => {
    vi.spyOn(investmentsService, 'getPortfolioSummary').mockResolvedValue(readySummary);
    await expect(investmentsService.recordDailySnapshotForUser('U1')).resolves.toBe(true);
    expect(investmentsService.getPortfolioSummary).toHaveBeenCalledWith('U1', {
      skipQuoteRefresh: true,
      skipDailySnapshot: true,
    });
    expect(mocks.from).toHaveBeenCalledWith('portfolio_performance_snapshots');
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'U1',
        cost_basis_usd: 100,
        market_value_usd: 120,
        unrealized_pnl_usd: 20,
        roi_percent: 20,
        blue_ars_per_usd: 1300,
      }),
      { onConflict: 'user_id,snapshot_date' }
    );
  });

  it('skips the write when FX is stale so page-load callers stay read-only', async () => {
    vi.spyOn(investmentsService, 'getPortfolioSummary').mockResolvedValue({
      ...readySummary,
      fxStale: true,
    });
    await expect(investmentsService.recordDailySnapshotForUser('U1')).resolves.toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('skips the write when a required valuation is missing', async () => {
    vi.spyOn(investmentsService, 'getPortfolioSummary').mockResolvedValue({
      ...readySummary,
      totalCurrentValue: null,
    });
    await expect(investmentsService.recordDailySnapshotForUser('U1')).resolves.toBe(false);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe('net-worth snapshot cron records portfolio snapshots without blocking pages', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret';
    mocks.from.mockImplementation((table: string) => {
      if (table === 'users') return usersQuery(['U1', 'U2']);
      throw new Error(`Unexpected table ${table}`);
    });
    mocks.netWorth.mockResolvedValue(true);
    vi.spyOn(investmentsService, 'recordDailySnapshotForUser').mockImplementation(mocks.portfolio);
    mocks.portfolio.mockResolvedValue(true);
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    vi.restoreAllMocks();
  });

  it('records both snapshots per user and counts a user processed if either succeeds', async () => {
    mocks.netWorth.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    mocks.portfolio.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const response = await netWorthSnapshotGet(
      new NextRequest('http://localhost/api/cron/net-worth-snapshot', {
        headers: { authorization: 'Bearer test-secret' },
      })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      job: 'net-worth-snapshot',
      total: 2,
      processed: 2,
      errors: 0,
    });
    expect(mocks.netWorth).toHaveBeenCalledTimes(2);
    expect(mocks.portfolio).toHaveBeenCalledTimes(2);
    expect(mocks.portfolio).toHaveBeenCalledWith('U1');
    expect(mocks.portfolio).toHaveBeenCalledWith('U2');
  });
});
