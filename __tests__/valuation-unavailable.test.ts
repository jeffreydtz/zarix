import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ rate: vi.fn(), dolar: vi.fn(), rows: {} as Record<string, unknown[]>, failures: {} as Record<string, unknown> }));
vi.mock('@/lib/supabase/server', () => ({ createServiceClientSync: () => ({
  from: (table: string) => {
    const query: any = { then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: mocks.rows[table] ?? [], error: mocks.failures[table] ?? null }).then(resolve) };
    for (const key of ['select', 'eq', 'order', 'in']) query[key] = () => query;
    return query;
  },
}) }));
vi.mock('@/lib/services/cotizaciones', () => ({ cotizacionesService: { getExchangeRate: mocks.rate, getDolarQuotes: mocks.dolar } }));
vi.mock('@/lib/yahoo-finance-quotes', () => ({ fetchYahooStockQuotesMap: vi.fn() }));
vi.mock('@/lib/stooq-us-quote', () => ({ fetchStooqUsQuote: vi.fn() }));
vi.mock('@/lib/market-data/data912-client', () => ({ loadArgentineQuotes: vi.fn() }));
import { accountsService } from '@/lib/services/accounts';
import { investmentsService } from '@/lib/services/investments';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rows = {};
  mocks.failures = {};
  mocks.rate.mockImplementation(async (from, to) => from === 'USD' && to === 'ARS' ? 1500 : 0);
  mocks.dolar.mockResolvedValue({ blue: { sell: 1500, buy: 1490 } });
});

describe('Valoración sin tasas o datos completos', () => {
  it.each([0, Infinity, NaN])('no transforma 500 EUR en cero con una tasa %s', async (rate) => {
    mocks.rows.accounts = [{ id: 'a', currency: 'EUR', balance: 500, type: 'bank', is_multicurrency: false }];
    mocks.rate.mockImplementation(async (from, to) => from === 'USD' && to === 'ARS' ? 1500 : rate);
    await expect(accountsService.list('owner')).rejects.toThrow('cotización');
  });
  it('no sustituye blue ausente por 1:1 en el portfolio', async () => {
    mocks.dolar.mockResolvedValue({ blue: { sell: 0, buy: 0 } });
    await expect(investmentsService.getPortfolioSummary('owner', { skipQuoteRefresh: true, skipDailySnapshot: true })).rejects.toThrow('blue');
  });
  it('falla cuando no puede convertir una inversión en EUR', async () => {
    mocks.rows.investments = [{ id: 'i', quantity: 2, purchase_price: 50, current_price: 60, purchase_currency: 'EUR', market_currency: 'EUR', type: 'other' }];
    await expect(investmentsService.getPortfolioSummary('owner', { skipQuoteRefresh: true, skipDailySnapshot: true })).rejects.toThrow('EUR');
  });
  it('no presenta ganancias realizadas cero cuando falla su consulta', async () => {
    mocks.failures.investment_sales = new Error('Historial no disponible');
    await expect(investmentsService.getPortfolioSummary('owner', { skipQuoteRefresh: true, skipDailySnapshot: true })).rejects.toThrow('Historial no disponible');
  });
});
