import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  refresh: vi.fn(),
  dolar: vi.fn(),
  fx: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceClientSync: () => ({ from: mocks.from, rpc: vi.fn() }),
}));

vi.mock('@/lib/services/cotizaciones', () => ({
  cotizacionesService: {
    getExchangeRate: mocks.fx,
    getDolarQuotes: mocks.dolar,
  },
}));

vi.mock('@/lib/market-data/quote-refresh', async () => {
  const actual = await vi.importActual<typeof import('@/lib/market-data/quote-refresh')>(
    '@/lib/market-data/quote-refresh'
  );
  return {
    ...actual,
    refreshQuotesForInvestments: (...args: unknown[]) => mocks.refresh(...args),
  };
});

import { investmentsService } from '@/lib/services/investments';
import { InvestmentQuoteMap, quoteCacheKeyForPosition } from '@/lib/market-data/quote-refresh';

function query(reply: { data?: unknown; error?: unknown }) {
  const q: Record<string, unknown> = {};
  const self = q;
  for (const key of ['select', 'eq', 'in', 'order', 'gte', 'lt', 'or', 'limit', 'update']) {
    q[key] = () => self;
  }
  q.maybeSingle = async () => reply;
  q.single = async () => reply;
  q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(reply).then(resolve, reject);
  return q;
}

describe('investment P&L converts cost and live quotes with blue, not MEP', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dolar.mockResolvedValue({
      blue: {
        type: 'blue',
        timestamp: new Date(),
        sell: 1300,
        buy: 1290,
        asOf: new Date().toISOString(),
      },
      mep: { type: 'mep', timestamp: new Date(), sell: 1200, buy: 1190 },
    });
    mocks.fx.mockResolvedValue(1);
  });

  it('does not invent P&L when MEP display USD differs from blue', async () => {
    const position = {
      id: 'I1',
      user_id: 'U1',
      account_id: 'A',
      type: 'stock_arg' as const,
      ticker: 'AL30',
      name: 'AL30',
      quantity: 1,
      purchase_price: 130000,
      purchase_currency: 'ARS',
      purchase_date: '2026-10-01',
      is_active: true,
      current_price: 90,
      current_price_updated_at: '2020-01-01T00:00:00Z',
      is_manual_price: false,
      market_currency: 'USD',
    };
    mocks.from.mockImplementation((table: string) => {
      if (table === 'investments') return query({ data: [position] });
      return query({ data: [] });
    });
    mocks.refresh.mockImplementation(async (investments: Array<typeof position>) => {
      const map = new InvestmentQuoteMap();
      for (const inv of investments) {
        const key = quoteCacheKeyForPosition(inv);
        if (!key) continue;
        map.set(key, {
          price: 130000 / 1200,
          changePct: 0,
          currency: 'USD',
          timestamp: '2026-10-25T12:00:00Z',
          sourcePrice: 130000,
          sourceCurrency: 'ARS',
        });
      }
      return map;
    });

    const [row] = await investmentsService.list('U1');
    expect(row.current_price).toBeCloseTo(130000 / 1200, 8);
    expect(row.cost_basis_usd).toBeCloseTo(100, 8);
    expect(row.market_value_usd).toBeCloseTo(100, 8);
    expect(row.profit_loss_usd).toBeCloseTo(0, 8);
    expect(row.profit_loss_usd).not.toBeCloseTo(130000 / 1200 - 100, 4);
  });
});
