// Real page and FX helper, with fixture-only data and provider responses.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  accounts: [{ currency: 'ARS', is_multicurrency: false, secondary_currency: null as string | null }],
  transactions: [{ currency: 'ARS', description: 'Movimiento de prueba' }],
}));
vi.mock('@/lib/auth/session', () => ({ getCachedUser: async () => ({ id: 'fixture-user' }) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: () => ({ select: () => ({ or: async () => ({ data: [], error: null }) }) }) }),
  createServiceClientSync: vi.fn(),
}));
vi.mock('@/lib/services/accounts', () => ({ accountsService: { list: async () => fixture.accounts } }));
vi.mock('@/lib/services/transactions', () => ({ transactionsService: { list: async () => fixture.transactions } }));
vi.mock('@/components/expenses/TransactionsList', () => ({
  default: ({ transactions }: { transactions: typeof fixture.transactions }) =>
    createElement('div', {}, transactions.map(transaction => transaction.description).join(', ')),
}));
vi.mock('@/components/expenses/TransactionsFilters', () => ({ default: () => null }));
vi.mock('@/components/expenses/CreateTransactionButton', () => ({ default: () => null }));

beforeEach(() => {
  vi.resetModules();
  fixture.accounts = [{ currency: 'ARS', is_multicurrency: false, secondary_currency: null }];
  fixture.transactions = [{ currency: 'ARS', description: 'Movimiento de prueba' }];
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Unexpected network request')));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function renderExpenses() {
  const { cotizacionesService } = await import('@/lib/services/cotizaciones');
  const dolar = vi.spyOn(cotizacionesService, 'getDolarQuotes').mockResolvedValue({
    status: 'available', missing: [],
    blue: { type: 'blue', buy: 1290, sell: 1300, timestamp: new Date(), stale: false },
  });
  const rates = vi.spyOn(cotizacionesService, 'getTransactionsFxRates');
  const { default: ExpensesPage } = await import('@/app/(authenticated)/expenses/page');
  const html = renderToStaticMarkup(await ExpensesPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain('Movimiento de prueba');
  return { html, dolar, rates };
}

describe('expenses FX dependencies follow displayed currencies', () => {
  it('does not request providers for ARS-only displayed data', async () => {
    const { html, dolar, rates } = await renderExpenses();
    expect(rates).toHaveBeenCalledWith(['ARS']);
    expect(dolar).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(html).not.toContain('Cotizaciones no disponibles');
  });

  it('requests blue without waiting for EUR/USD for USD movements', async () => {
    fixture.transactions[0].currency = 'USD';
    const { html, dolar, rates } = await renderExpenses();
    expect(rates).toHaveBeenCalledWith(['USD', 'ARS']);
    expect(dolar).toHaveBeenCalledWith({ require: ['blue'] });
    expect(fetch).not.toHaveBeenCalled();
    expect(html).not.toContain('Cotizaciones no disponibles');
  });

  it.each(['transaction', 'account', 'secondary account'])(
    'requests EUR/USD when a displayed %s needs EUR', async source => {
      if (source === 'transaction') fixture.transactions[0].currency = 'EUR';
      if (source === 'account') fixture.accounts[0].currency = 'EUR';
      if (source === 'secondary account') {
        fixture.accounts[0].is_multicurrency = true;
        fixture.accounts[0].secondary_currency = 'EUR';
      }
      const provider = vi.fn().mockResolvedValue(new Response(JSON.stringify({ chart: { result: [{ meta: {
        regularMarketPrice: 1.08, regularMarketTime: Math.floor(Date.now() / 1000),
      } }] } }), { status: 200 }));
      vi.stubGlobal('fetch', provider);
      const { html, rates } = await renderExpenses();
      expect(rates).toHaveBeenCalledWith(expect.arrayContaining(['EUR']));
      expect(provider).toHaveBeenCalledOnce();
      expect(String(provider.mock.calls[0][0])).toContain('EURUSD=X');
      expect(html).not.toContain('Cotizaciones no disponibles');
    },
  );

  it('ignores an unused secondary EUR currency on a single-currency account', async () => {
    fixture.accounts[0].secondary_currency = 'EUR';
    const { rates } = await renderExpenses();
    expect(rates).toHaveBeenCalledWith(['ARS']);
    expect(fetch).not.toHaveBeenCalled();
  });
});
