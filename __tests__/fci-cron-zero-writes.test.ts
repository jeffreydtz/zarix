import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { resetCafciCatalogCacheForTest } from '@/lib/market-data/cafci-client';
import {
  cafciValoresAlLabel,
  civilYmdToDmyLabel,
  freshFciNavIso,
  shiftBusinessDays,
} from '@/lib/market-data/fci-nav-freshness';
import { civilTodayYmd } from '@/lib/transaction-date';

const mocks = vi.hoisted(() => ({
  arg: vi.fn(),
  dolar: vi.fn(),
  yahoo: vi.fn(),
  stooq: vi.fn(),
  crypto: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  alert: vi.fn(),
  investments: [] as Array<Record<string, unknown>>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/market-data/data912-client', () => ({ loadArgentineQuotes: mocks.arg }));
vi.mock('@/lib/services/cotizaciones', () => ({
  cotizacionesService: { getDolarQuotes: mocks.dolar, getCryptoQuote: mocks.crypto },
}));
vi.mock('@/lib/yahoo-finance-quotes', () => ({ fetchYahooStockQuotesMap: mocks.yahoo }));
vi.mock('@/lib/stooq-us-quote', () => ({ fetchStooqUsQuote: mocks.stooq }));
vi.mock('@/lib/observability/alert', () => ({ alertAdmin: mocks.alert }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
  createServiceClientSync: () => ({ from: mocks.from }),
}));

import { GET as cronGet } from '@/app/api/cron/update-prices/route';

const STATS_CATALOG = {
  fondos: [
    {
      id: 227,
      nombre: 'Premier Renta Variable',
      moneda: { id: 1, nombre: 'Peso Argentina' },
      clases: [{
        id: 784,
        nombre: 'Premier Renta Variable - Clase B',
        moneda: { id: 1, nombre: 'Peso Argentina' },
        ticker_bloomberg: 'PRTAVAB   ',
      }],
    },
    {
      id: 1570,
      nombre: 'IOL Dólar Ahorro Plus',
      moneda: { id: 2, nombre: 'Dolar Estadounidense' },
      clases: [{
        id: 5100,
        nombre: 'IOL Dólar Ahorro Plus - Clase D',
        moneda: { id: 2, nombre: 'Dolar Estadounidense' },
        ticker_bloomberg: null,
      }],
    },
  ],
};

function htmlFicha(opts: {
  priceLabel: string;
  date?: string;
  moneda?: string;
  fondoId: string;
  claseId: string;
  selectedClaseId?: string;
}): string {
  const selected = opts.selectedClaseId ?? opts.claseId;
  return `<html><body>
    <form method="get" action="/fondos/${opts.fondoId}">
      <label>Clase:
        <select name="clase">
          <option value="${opts.fondoId}"${selected === opts.fondoId ? ' selected' : ''}>Clase A</option>
          <option value="${opts.claseId}"${selected === opts.claseId ? ' selected' : ''}>Clase B</option>
        </select>
      </label>
    </form>
    <div id="cuotaparte">
      <h3>Valores al ${opts.date ?? cafciValoresAlLabel()}</h3>
      <p>Valor por cada cuotaparte: ${opts.priceLabel}</p>
    </div>
    <span class="label">Moneda:</span> ${opts.moneda ?? 'Peso Argentina'}
  </body></html>`;
}

function iolRow(symbol: string, priceCell: string, change = '0,15%'): string {
  return `<tr>
    <td><a data-symbol="${symbol}">${symbol}</a></td>
    <td class="text-right">${priceCell}</td>
    <td class="text-right">${change}</td>
  </tr>`;
}

function stubFetch(handlers: {
  catalog?: unknown;
  fichas?: Record<string, string>;
  iol?: string;
  status?: Record<string, number>;
}) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    const statusFor = (key: string, fallback = 200) => handlers.status?.[key] ?? fallback;
    if (u.includes('consulta-de-fondos.json')) {
      const status = statusFor('catalog');
      const body = handlers.catalog ?? STATS_CATALOG;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => JSON.stringify(body),
        headers: new Headers(),
      };
    }
    const ficha = u.match(/\/fondos\/(\d+)\?clase=(\d+)/);
    if (ficha) {
      const key = `${ficha[1]}:${ficha[2]}`;
      const status = statusFor('ficha');
      const html = handlers.fichas?.[key] ?? '';
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => html,
        json: async () => ({}),
        headers: new Headers(),
      };
    }
    if (u.includes('invertironline.com')) {
      const status = statusFor('iol');
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async () => handlers.iol ?? '<html></html>',
        json: async () => ({}),
        headers: new Headers(),
      };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '', headers: new Headers() };
  }));
}

const cronRequest = () => new NextRequest('http://localhost/api/cron/update-prices', {
  headers: { authorization: 'Bearer synthetic-cron-secret' },
});

function setPosition(overrides: Record<string, unknown> = {}) {
  mocks.investments = [{
    id: 'fixture-prtava-b',
    type: 'fci',
    ticker: 'PRTAVAB',
    market_currency: 'ARS',
    purchase_currency: 'ARS',
    current_price: 1240,
    current_price_updated_at: null,
    is_manual_price: false,
    ...overrides,
  }];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updates = [];
  resetCafciCatalogCacheForTest();
  vi.stubEnv('CRON_SECRET', 'synthetic-cron-secret');
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'fixture-user' } } });
  mocks.dolar.mockResolvedValue({
    blue: { timestamp: new Date(), sell: 1300, buy: 1300 },
    mep: { timestamp: new Date(), sell: 1300, buy: 1300 },
  });
  mocks.yahoo.mockResolvedValue(new Map());
  mocks.stooq.mockResolvedValue(null);
  mocks.crypto.mockResolvedValue({ priceUSD: 0 });
  mocks.alert.mockResolvedValue(undefined);
  mocks.arg.mockResolvedValue({
    byStock: new Map(), byCedear: new Map(), byBond: new Map(), byCorp: new Map(),
  });
  setPosition();
  mocks.update.mockImplementation((payload: Record<string, unknown>) => {
    mocks.updates.push(payload);
    return { eq: vi.fn().mockResolvedValue({ error: null }) };
  });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'exchange_rates') {
      return { upsert: vi.fn().mockResolvedValue({ error: null }) };
    }
    const query = {
      select: () => query,
      eq: () => query,
      in: async () => ({ data: mocks.investments, error: null }),
      update: mocks.update,
    };
    return query;
  });
});

afterEach(() => {
  resetCafciCatalogCacheForTest();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('cron FCI writes stay at zero for bad source data', () => {
  it('writes a matching class with a fresh Valores al date', async () => {
    stubFetch({
      fichas: {
        '227:784': htmlFicha({
          priceLabel: '1.241,954039',
          fondoId: '227',
          claseId: '784',
        }),
      },
    });
    expect(await (await cronGet(cronRequest())).json()).toMatchObject({
      success: true, processed: 1, errors: 0,
    });
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0].current_price).toBeCloseTo(1241.954039, 8);
  });

  it('does not write when CAFCI silently returns another class', async () => {
    stubFetch({
      fichas: {
        '227:784': htmlFicha({
          priceLabel: '1.451,064642',
          fondoId: '227',
          claseId: '784',
          selectedClaseId: '227',
        }),
      },
      iol: `<table>${iolRow('PRTAVAB', 'AR$ 1.241,95')}</table>`,
    });
    const body = await (await cronGet(cronRequest())).json();
    expect(body.processed).toBe(0);
    expect(mocks.updates).toHaveLength(0);
  });

  it('does not write a stale Valores al date', async () => {
    stubFetch({
      fichas: {
        '227:784': htmlFicha({
          priceLabel: '1.241,954039',
          date: '06/01/2025',
          fondoId: '227',
          claseId: '784',
        }),
      },
    });
    const body = await (await cronGet(cronRequest())).json();
    expect(body.processed).toBe(0);
    expect(mocks.updates).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledWith('[quotes] skip CAFCI failure', expect.objectContaining({
      ticker: 'PRTAVAB',
      reason: 'stale_nav',
      source: 'cafci',
      id: 'fixture-prtava-b',
    }));
  });

  it('does not write a malformed cuotaparte', async () => {
    stubFetch({
      fichas: {
        '227:784': htmlFicha({
          priceLabel: '1,10,90',
          fondoId: '227',
          claseId: '784',
        }),
      },
    });
    expect((await (await cronGet(cronRequest())).json()).processed).toBe(0);
    expect(mocks.updates).toHaveLength(0);
  });

  it('does not write an ambiguous catalog match even when IOL lists the ticker', async () => {
    stubFetch({
      catalog: {
        fondos: [
          {
            id: 1,
            clases: [{ id: 2, simbolo: 'PRTAVAB', moneda: { nombre: 'Peso Argentina' } }],
          },
          {
            id: 3,
            clases: [{ id: 4, simbolo: 'PRTAVAB', moneda: { nombre: 'Peso Argentina' } }],
          },
        ],
      },
      iol: `<table>${iolRow('PRTAVAB', 'AR$ 1.241,95')}</table>`,
    });
    expect((await (await cronGet(cronRequest())).json()).processed).toBe(0);
    expect(mocks.updates).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledWith('[quotes] skip CAFCI failure', expect.objectContaining({
      reason: 'ambiguous_match',
    }));
  });

  it('does not write an undated IOL fallback', async () => {
    setPosition({
      ticker: 'IOLDOLD',
      market_currency: 'USD',
      purchase_currency: 'USD',
      current_price: 1.09,
      id: 'fixture-ioldold',
    });
    stubFetch({
      catalog: { fondos: [] },
      iol: `<table>${iolRow('IOLDOLD', 'US$ 1,10')}</table>`,
    });
    expect((await (await cronGet(cronRequest())).json()).processed).toBe(0);
    expect(mocks.updates).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledWith('[quotes] skip CAFCI failure', expect.objectContaining({
      ticker: 'IOLDOLD',
      reason: 'undated',
      source: 'iol',
      stage: 'iol',
    }));
  });

  it('does not write IOL that is 1000x the stored band', async () => {
    setPosition({
      ticker: 'IOLDOLD',
      market_currency: 'USD',
      purchase_currency: 'USD',
      current_price: 1.09,
      current_price_updated_at: freshFciNavIso(),
      id: 'fixture-ioldold',
    });
    stubFetch({
      catalog: { fondos: [] },
      iol: `<table>${iolRow('IOLDOLD', 'US$ 1.090,00')}</table>`,
    });
    expect((await (await cronGet(cronRequest())).json()).processed).toBe(0);
    expect(mocks.updates).toHaveLength(0);
  });

  it('does not write IOL whose currency disagrees with the catalog class', async () => {
    setPosition({
      ticker: 'IOLDOLD',
      market_currency: 'USD',
      purchase_currency: 'USD',
      current_price: 1.09,
      id: 'fixture-ioldold',
    });
    stubFetch({
      fichas: { '1570:5100': '<html><body>no nav</body></html>' },
      iol: `<table>${iolRow('IOLDOLD', 'AR$ 1,10')}</table>`,
    });
    expect((await (await cronGet(cronRequest())).json()).processed).toBe(0);
    expect(mocks.updates).toHaveLength(0);
  });

  it('does not let IOL replace a fresher stored CAFCI observation', async () => {
    const stored = freshFciNavIso();
    setPosition({
      current_price: 1241.95,
      current_price_updated_at: stored,
    });
    stubFetch({
      fichas: {
        '227:784': htmlFicha({
          priceLabel: '1.200,00',
          date: civilYmdToDmyLabel(
            shiftBusinessDays(civilTodayYmd('America/Argentina/Buenos_Aires'), -2)
          ),
          fondoId: '227',
          claseId: '784',
        }),
      },
    });
    expect((await (await cronGet(cronRequest())).json()).processed).toBe(0);
    expect(mocks.updates).toHaveLength(0);
    expect(console.warn).toHaveBeenCalledWith('[quotes] skip CAFCI failure', expect.objectContaining({
      reason: 'older_than_stored',
    }));
  });
});
