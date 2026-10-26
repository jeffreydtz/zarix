import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAFCI_HEADERS,
  CafciHttpError,
  cafciClassesFromCatalogForTest,
  fetchFciQuote,
  isCafciForbidden,
  firstCurrencyLabel,
  parseCafciCurrencyLabel,
  parseCafciDateLabel,
  parseCafciHtmlFicha,
  resetCafciCatalogCacheForTest,
  resolveCafciCurrencySources,
} from '@/lib/market-data/cafci-client';
import { parseArgentineNumber, parseIolFondosPanel } from '@/lib/market-data/iol-fci-panel';

describe('CAFCI client headers and 403', () => {
  beforeEach(() => {
    resetCafciCatalogCacheForTest();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetCafciCatalogCacheForTest();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends a full browser User-Agent instead of a bare Mozilla/5.0 token', () => {
    expect(CAFCI_HEADERS['User-Agent']).toMatch(/Chrome\/\d/);
    expect(CAFCI_HEADERS['User-Agent']).not.toBe('Mozilla/5.0');
    expect(CAFCI_HEADERS['Accept-Language']).toMatch(/es/);
    expect(CAFCI_HEADERS.Origin).toBe('https://www.cafci.org.ar');
    expect(CAFCI_HEADERS.Referer).toBe('https://www.cafci.org.ar/');
  });

  it('treats CAFCI 403 as forbidden so the refresh can skip and keep the last price', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchFciQuote('IOLDOLD')).rejects.toSatisfy((error: unknown) => isCafciForbidden(error));
    expect(fetchMock).toHaveBeenCalled();
    const init = fetchMock.mock.calls[0][1] as {
      headers: Record<string, string>;
      cache?: RequestCache;
      next?: { revalidate?: number };
    };
    expect(init.headers['User-Agent']).toBe(CAFCI_HEADERS['User-Agent']);
    expect(init.headers['Accept-Language']).toBe(CAFCI_HEADERS['Accept-Language']);
    expect(init.cache).toBe('no-store');
    expect(init.next?.revalidate).toBeUndefined();
    const err = await fetchFciQuote('IOLDOLD').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CafciHttpError);
    expect((err as CafciHttpError).status).toBe(403);
  });

  it('propagates CAFCI 500 so the refresh can skip without a Yahoo fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchFciQuote('IOLDOLD')).rejects.toMatchObject({ status: 500, name: 'CafciHttpError' });
  });

  it('returns null when the catalog 200 is an error payload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'denied' }),
    }));
    await expect(fetchFciQuote('IOLDOLD')).resolves.toBeNull();
  });

  it('returns null when valorCuotaparte is missing', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            id: 1,
            nombre: 'IOL Dolar',
            clases: [{ id: 2, simbolo: 'IOLDOLD', moneda: 'Dolares' }],
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { valorCuotaparte: null, fecha: '2026-10-23' } }),
      });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchFciQuote('IOLDOLD')).resolves.toBeNull();
  });

  it('returns null when the ficha 200 cannot be parsed', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            id: 1,
            nombre: 'IOL Dolar',
            clases: [{ id: 2, simbolo: 'IOLDOLD', moneda: 'Dolares' }],
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ foo: 1 }),
      });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchFciQuote('IOLDOLD')).resolves.toBeNull();
  });

  it('uses the class moneda when the ficha payload has no currency', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            id: 1,
            nombre: 'IOL Dolar',
            clases: [{ id: 2, simbolo: 'IOLDOLD', moneda: 'Dolares' }],
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { valorCuotaparte: 1.098, fecha: '2026-10-23' } }),
      });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchFciQuote('IOLDOLD')).resolves.toMatchObject({
      ticker: 'IOLDOLD',
      price: 1.098,
      currency: 'USD',
      source: 'cafci',
    });
  });

  it('keeps catalog class USD when the ficha only has fondo.moneda Pesos', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            id: 1,
            nombre: 'IOL Dolar',
            clases: [{ id: 2, simbolo: 'IOLDOLD', moneda: 'Dolares' }],
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { valorCuotaparte: 1.098, fondo: { moneda: 'Pesos' } },
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchFciQuote('IOLDOLD')).resolves.toMatchObject({
      ticker: 'IOLDOLD',
      price: 1.098,
      currency: 'USD',
    });
  });

  it('does not let catalog fund Pesos beat a ficha data-level USD cuotaparte', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            id: 1,
            nombre: 'IOL Dolar',
            moneda: 'Pesos',
            clases: [{ id: 2, simbolo: 'IOLDOLD' }],
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { valorCuotaparte: 1.098, moneda: 'USD' } }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const quote = await fetchFciQuote('IOLDOLD');
    expect(quote?.price).toBe(1.098);
    expect(quote?.currency).not.toBe('ARS');
    expect(quote?.currency === 'USD' || quote?.currencySkip === 'conflict').toBe(true);
  });

  it.each([
    ['Pesos', 'ARS'],
    ['Peso', 'ARS'],
    ['Peso Argentino', 'ARS'],
    ['Pesos Argentinos', 'ARS'],
    ['Peso Argentina', 'ARS'],
    ['PESOS ARGENTINA', 'ARS'],
    ['Peso Argentina / ARS', 'ARS'],
    ['ARS', 'ARS'],
    ['ARS - Moneda local', 'ARS'],
    ['Dólar', 'USD'],
    ['Dólares', 'USD'],
    ['Dolar', 'USD'],
    ['Dolares', 'USD'],
    ['Dólar Estadounidense', 'USD'],
    ['Dólares Estadounidenses', 'USD'],
    ['Dollar', 'USD'],
    ['Dollars', 'USD'],
    ['USD', 'USD'],
    ['ＵＳＤ', 'USD'],
    ['US', 'USD'],
    ['US$', 'USD'],
    ['Dólar MEP', 'USD'],
    ['Dólares MEP', 'USD'],
    ['Dólar Cable', 'USD'],
    ['Dólares Cable', 'USD'],
    ['Dólar CCL', 'USD'],
    ['Dólares CCL', 'USD'],
    ['Dólar Estadounidense MEP', 'USD'],
    ['Dólar Estadounidense Cable', 'USD'],
    ['Dólar Estadounidense CCL', 'USD'],
    ['Dólares estadounidenses MEP', 'USD'],
    ['Dólares estadounidenses Cable', 'USD'],
    ['Dólares estadounidenses CCL', 'USD'],
    ['USD MEP', 'USD'],
    ['USD Cable', 'USD'],
    ['USD CCL', 'USD'],
    ['USD Billete', 'USD'],
    ['USD billetes', 'USD'],
    ['U$S MEP', 'USD'],
    ['Dolar EEUU', 'USD'],
    ['Dólar billete', 'USD'],
    ['US Dollar', 'USD'],
    ['U.S. Dollar', 'USD'],
    ['Dólar USA', 'USD'],
    ['Dólar de Estados Unidos', 'USD'],
    ['U$S', 'USD'],
  ] as const)('maps CAFCI label %s to %s', (label, expected) => {
    expect(parseCafciCurrencyLabel(label)).toBe(expected);
  });

  it.each([
    'Dólares canadienses',
    'Pesos mexicanos',
    'EUR',
    'Euro',
    'CAD',
    'MXN',
    'BRL',
    'Canadian Dollar',
    'Canadian Dollars',
    'Mexican Peso',
    'Mexican Pesos',
    'Brazilian Real',
    'Pound Sterling',
    'Yen',
    'Swiss Franc',
    'Swiss Francs',
    'Sol peruano',
    'Indian Rupee',
    'HKD',
    'Dólar canadiense',
    'Peso mexicano',
    'Peso uruguayo',
    'Dolar fiyiano',
    'New Zealand Dollar',
    'NZ Dollar',
    'Dólar liberiano',
    'Pesos/Dólares',
    'Peso Ley',
    'Moneda local',
    'Dollar de Fiyi',
    'Dólar ＣＡＮＡＤＩＥＮＳＥ',
    'Dólar канадский',
    'Peso ＭＥＸＩＣＡＮＯ',
    'US Peso',
  ])('treats %s as unsupported instead of ARS/USD', (label) => {
    expect(parseCafciCurrencyLabel(label)).toBe('unsupported');
  });

  it('ignores numeric codes and non-currency words instead of treating them as unsupported', () => {
    expect(parseCafciCurrencyLabel(2)).toBeNull();
    expect(parseCafciCurrencyLabel('123')).toBeNull();
    expect(parseCafciCurrencyLabel('Local')).toBeNull();
    expect(parseCafciCurrencyLabel('$')).toBeNull();
    expect(parseCafciCurrencyLabel('')).toBeNull();
    expect(firstCurrencyLabel('USD', 2)).toBe('USD');
    expect(firstCurrencyLabel('Pesos', 'Local')).toBe('ARS');
    expect(firstCurrencyLabel('USD', 'EUR')).toBe('conflict');
  });

  it('treats mixed fields at one CAFCI level as a conflict skip', () => {
    expect(firstCurrencyLabel('USD', 'EUR')).toBe('conflict');
    expect(firstCurrencyLabel(undefined, 'USD', 'EUR')).toBe('conflict');
    expect(firstCurrencyLabel('USD', 'Dólar')).toBe('USD');
    expect(firstCurrencyLabel('Pesos', 'ARS')).toBe('ARS');
    expect(firstCurrencyLabel(null, undefined, '')).toBeNull();
    expect(firstCurrencyLabel('EUR')).toBe('unsupported');
  });

  it('skips when tipoMoneda USD disagrees with moneda EUR at the same ficha level', async () => {
    expect(firstCurrencyLabel('USD', 'EUR')).toBe('conflict');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            id: 1,
            nombre: 'IOL Dolar',
            clases: [{ id: 2, simbolo: 'IOLDOLD' }],
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { valorCuotaparte: 1.098, tipoMoneda: 'USD', moneda: 'EUR' } }),
      });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchFciQuote('IOLDOLD')).resolves.toMatchObject({
      price: 1.098,
      currency: null,
      currencySkip: 'conflict',
    });
  });

  it('keeps USD when moneda USD and numeric tipoMoneda 2 share a level', async () => {
    expect(firstCurrencyLabel('USD', 2)).toBe('USD');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            id: 1,
            nombre: 'IOL Dolar',
            clases: [{ id: 2, simbolo: 'IOLDOLD' }],
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { valorCuotaparte: 1.098, moneda: 'USD', tipoMoneda: 2 } }),
      });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchFciQuote('IOLDOLD')).resolves.toMatchObject({
      price: 1.098,
      currency: 'USD',
    });
  });

  it('prices IOLDOLD as ARS when CAFCI names ARS - Moneda local', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            id: 1,
            nombre: 'IOL Dolar',
            clases: [{ id: 2, simbolo: 'IOLDOLD' }],
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { valorCuotaparte: 1.098, moneda: 'ARS - Moneda local' } }),
      });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchFciQuote('IOLDOLD')).resolves.toMatchObject({
      price: 1.098,
      currency: 'ARS',
    });
  });

  it('keeps ARS when moneda Pesos and tipoMoneda Local share a level', async () => {
    expect(firstCurrencyLabel('Pesos', 'Local')).toBe('ARS');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            id: 1,
            nombre: 'Peso fund',
            clases: [{ id: 2, simbolo: 'CONIOLA' }],
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { valorCuotaparte: 179.598, moneda: 'Pesos', tipoMoneda: 'Local' } }),
      });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchFciQuote('CONIOLA')).resolves.toMatchObject({
      price: 179.598,
      currency: 'ARS',
    });
  });

  it('keeps USD when tipoMoneda USD and moneda Dólar agree at the same ficha level', async () => {
    expect(firstCurrencyLabel('USD', 'Dólar')).toBe('USD');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            id: 1,
            nombre: 'IOL Dolar',
            clases: [{ id: 2, simbolo: 'IOLDOLD' }],
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { valorCuotaparte: 1.098, tipoMoneda: 'USD', moneda: 'Dólar' } }),
      });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchFciQuote('IOLDOLD')).resolves.toMatchObject({
      price: 1.098,
      currency: 'USD',
    });
  });

  it.each([
    'Dólar MEP', 'Dólares CCL', 'Dólares estadounidenses MEP',
    'Dolar EEUU', 'Dólar billete', 'US Dollar', 'U.S. Dollar', 'Dólar USA',
    'USD Billete', 'USD billetes', 'U$S MEP', 'ＵＳＤ', 'US', 'US$',
  ] as const)(
    'prices IOLDOLD 1.098 USD when CAFCI names %s',
    async (moneda) => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{
              id: 1,
              nombre: 'IOL Dolar',
              clases: [{ id: 2, simbolo: 'IOLDOLD' }],
            }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { valorCuotaparte: 1.098, moneda, fecha: '2026-10-23' } }),
        });
      vi.stubGlobal('fetch', fetchMock);
      await expect(fetchFciQuote('IOLDOLD')).resolves.toMatchObject({
        ticker: 'IOLDOLD',
        price: 1.098,
        currency: 'USD',
      });
    }
  );

  it.each([
    'Canadian Dollar', 'Mexican Peso', 'Dolar fiyiano', 'NZ Dollar',
    'Pesos/Dólares', 'HKD', 'EUR',
    'Dólar ＣＡＮＡＤＩＥＮＳＥ', 'Dólar канадский', 'Peso ＭＥＸＩＣＡＮＯ', 'US Peso',
  ] as const)(
    'skips IOLDOLD when CAFCI names %s',
    async (moneda) => {
      expect(parseCafciCurrencyLabel(moneda)).toBe('unsupported');
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{
              id: 1,
              nombre: 'IOL Dolar',
              clases: [{ id: 2, simbolo: 'IOLDOLD' }],
            }],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { valorCuotaparte: 1.098, moneda } }),
        });
      vi.stubGlobal('fetch', fetchMock);
      await expect(fetchFciQuote('IOLDOLD')).resolves.toMatchObject({
        price: 1.098,
        currency: null,
        currencySkip: 'unsupported',
      });
    }
  );

  it('skips an explicit EUR CAFCI currency instead of treating it as unknown', async () => {
    expect(parseCafciCurrencyLabel('EUR')).toBe('unsupported');
    expect(resolveCafciCurrencySources({
      catalogClass: null, fichaClass: null, fichaData: 'unsupported', catalogFund: null,
    })).toEqual({ currency: null, reason: 'unsupported' });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{
            id: 1,
            nombre: 'IOL Euro',
            clases: [{ id: 2, simbolo: 'IOLDOLD' }],
          }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { valorCuotaparte: 1.098, moneda: 'EUR' } }),
      });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchFciQuote('IOLDOLD')).resolves.toMatchObject({
      price: 1.098,
      currency: null,
      currencySkip: 'unsupported',
    });
  });
});

describe('CAFCI failure diagnostics', () => {
  const catalog = [{ id: 10, nombre: 'IOL Dolar Ahorro Plus', clases: [{ id: 20, simbolo: 'IOLDOLD', moneda: 'USD' }] }];

  beforeEach(() => resetCafciCatalogCacheForTest());
  afterEach(() => {
    resetCafciCatalogCacheForTest();
    vi.unstubAllGlobals();
  });

  it('tags a catalog 403 with stage and capped Server header', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers({ server: 'awselb/2.0' }),
      json: async () => ({}),
    }));
    const err = await fetchFciQuote('IOLDOLD').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CafciHttpError);
    expect(err).toMatchObject({ status: 403, stage: 'catalog', server: 'awselb/2.0', message: 'CAFCI catalog 403' });
    expect(isCafciForbidden(err)).toBe(true);
  });

  it('tags a ficha 401 after a good catalog', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => catalog })
      .mockResolvedValueOnce({ ok: false, status: 401, headers: new Headers(), json: async () => ({}) }));
    const err = await fetchFciQuote('IOLDOLD').catch((e: unknown) => e);
    expect(err).toMatchObject({ name: 'CafciHttpError', status: 401, stage: 'ficha', message: 'CAFCI ficha 401' });
    expect((err as CafciHttpError).server).toBeUndefined();
  });

  it('caps a hostile Server header and strips control characters', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: () => `bad\r\n${'x'.repeat(500)}` },
      json: async () => ({}),
    }));
    const err = (await fetchFciQuote('IOLDOLD').catch((e: unknown) => e)) as CafciHttpError;
    expect(err.server?.length).toBeLessThanOrEqual(60);
    expect(err.server).not.toMatch(/[\r\n]/);
  });

  it('wraps a network failure with the stage', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    await expect(fetchFciQuote('IOLDOLD')).rejects.toMatchObject({
      name: 'CafciFetchError',
      stage: 'catalog',
      message: 'CAFCI catalog TypeError: fetch failed',
    });
  });

  it('wraps an invalid JSON ficha with the stage', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => catalog })
      .mockResolvedValueOnce({ ok: true, json: async () => { throw new SyntaxError('Unexpected token <'); } }));
    await expect(fetchFciQuote('IOLDOLD')).rejects.toMatchObject({ name: 'CafciFetchError', stage: 'ficha' });
  });

  it('reports no_match, ambiguous_match and unparseable_ficha without changing the null result', async () => {
    const ambiguous = [
      { id: 1, clases: [{ id: 2, simbolo: 'DUPE' }] },
      { id: 3, clases: [{ id: 4, simbolo: 'DUPE' }] },
    ];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = String(url);
      const empty = async (): Promise<string> => '';
      if (u.includes('consulta-de-fondos.json')) {
        return { ok: true, json: async () => [...catalog, ...ambiguous], text: empty };
      }
      if (u.includes('invertironline')) {
        return { ok: true, text: async (): Promise<string> => '<html><body>no funds</body></html>' };
      }
      return { ok: true, json: async () => ({ data: { valorCuotaparte: null } }), text: empty };
    }));
    const reasons: string[] = [];
    const onMiss = (r: string) => reasons.push(r);
    await expect(fetchFciQuote('NOPE', onMiss)).resolves.toBeNull();
    await expect(fetchFciQuote('DUPE', onMiss)).resolves.toBeNull();
    await expect(fetchFciQuote('IOLDOLD', onMiss)).resolves.toBeNull();
    await expect(fetchFciQuote('  ', onMiss)).resolves.toBeNull();
    expect(reasons).toEqual(['no_match', 'ambiguous_match', 'unparseable_ficha', 'empty_ticker']);
  });

  it('ignores a throwing onMiss callback', async () => {
    await expect(fetchFciQuote('', () => { throw new Error('boom'); })).resolves.toBeNull();
  });
});

const STATS_CATALOG = {
  generated_at: '2026-10-23T20:18:34-03:00',
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
      id: 622,
      nombre: 'Adcap Acciones',
      moneda: { id: 1, nombre: 'Peso Argentina' },
      clases: [{
        id: 1255,
        nombre: 'Adcap Acciones - Clase A',
        moneda: { id: 1, nombre: 'Peso Argentina' },
        ticker_bloomberg: 'CONIOLA   ',
      }],
    },
    {
      id: 750,
      nombre: 'Adcap Renta Dólar',
      moneda: { id: 2, nombre: 'Dolar Estadounidense' },
      clases: [{
        id: 1645,
        nombre: 'Adcap Renta Dólar - Clase D',
        moneda: { id: 2, nombre: 'Dolar Estadounidense' },
        ticker_bloomberg: 'ADCGLOA AR',
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

function htmlFicha(opts: { priceLabel: string; date?: string; moneda?: string }): string {
  return `<html><body>
    <h3>Valores al ${opts.date ?? '23/10/2026'}</h3>
    <p>Valor por cada cuotaparte: ${opts.priceLabel}</p>
    <p>(Valor por mil: 1.097,744)</p>
    <span class="label">Moneda:</span> ${opts.moneda ?? 'Dolar Estadounidense'}</li>
  </body></html>`;
}

function stubByUrl(handlers: { catalog?: unknown; fichas?: Record<string, string>; iol?: string; status?: Record<string, number> }) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const u = String(url);
    const statusFor = (key: string, fallback = 200) => handlers.status?.[key] ?? fallback;
    if (u.includes('consulta-de-fondos.json')) {
      const status = statusFor('catalog');
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => handlers.catalog ?? STATS_CATALOG,
        text: async (): Promise<string> => JSON.stringify(handlers.catalog ?? STATS_CATALOG),
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
        text: async (): Promise<string> => html,
        json: async () => ({}),
        headers: new Headers(),
      };
    }
    if (u.includes('invertironline.com')) {
      const status = statusFor('iol');
      return {
        ok: status >= 200 && status < 300,
        status,
        text: async (): Promise<string> => handlers.iol ?? '<html></html>',
        json: async () => ({}),
        headers: new Headers(),
      };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async (): Promise<string> => '', headers: new Headers() };
  }));
}

describe('CAFCI stats catalog + HTML ficha (2026 public endpoints)', () => {
  beforeEach(() => {
    resetCafciCatalogCacheForTest();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    resetCafciCatalogCacheForTest();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('parses Argentine cuotaparte labels from the official HTML ficha', () => {
    expect(parseCafciHtmlFicha(htmlFicha({ priceLabel: '1,097744', moneda: 'Dolar Estadounidense' }))).toMatchObject({
      price: 1.097744, currency: 'USD',
    });
    expect(parseCafciHtmlFicha(htmlFicha({ priceLabel: '1.241,954039', moneda: 'Peso Argentina' }))).toMatchObject({
      price: 1241.954039, currency: 'ARS',
    });
    expect(parseCafciHtmlFicha(htmlFicha({ priceLabel: '179,598356', moneda: 'Peso Argentina' }))).toMatchObject({
      price: 179.598356, currency: 'ARS',
    });
    expect(parseCafciHtmlFicha(htmlFicha({ priceLabel: '1,348784', moneda: 'Dolar Estadounidense' }))).toMatchObject({
      price: 1.348784, currency: 'USD',
    });
    expect(parseCafciHtmlFicha('<p>Valor por mil: 1.097,744</p>')).toBeNull();
    expect(parseCafciDateLabel('23/10/2026')).toBe('2026-10-23T03:00:00.000Z');
  });

  it('matches Bloomberg tickers including an AR suffix and the IOLDOLD alias', () => {
    const classes = cafciClassesFromCatalogForTest(STATS_CATALOG);
    expect(classes.find((c) => c.keys.includes('PRTAVAB'))).toMatchObject({ fondoId: '227', claseId: '784', currency: 'ARS' });
    expect(classes.find((c) => c.keys.includes('CONIOLA'))).toMatchObject({ fondoId: '622', claseId: '1255', currency: 'ARS' });
    expect(classes.find((c) => c.keys.includes('ADCGLOA'))).toMatchObject({ fondoId: '750', claseId: '1645', currency: 'USD' });
    expect(classes.find((c) => c.keys.includes('ADCGLOAAR'))).toBeUndefined();
    expect(classes.find((c) => c.keys.includes('IOLDOLD'))).toMatchObject({ fondoId: '1570', claseId: '5100', currency: 'USD' });
  });

  it('prices the four user FCIs from the stats HTML ficha', async () => {
    stubByUrl({
      fichas: {
        '227:784': htmlFicha({ priceLabel: '1.241,954039', moneda: 'Peso Argentina' }),
        '622:1255': htmlFicha({ priceLabel: '179,598356', moneda: 'Peso Argentina' }),
        '1570:5100': htmlFicha({ priceLabel: '1,097744', moneda: 'Dolar Estadounidense' }),
        '750:1645': htmlFicha({ priceLabel: '1,348784', moneda: 'Dolar Estadounidense' }),
      },
    });
    await expect(fetchFciQuote('PRTAVAB')).resolves.toMatchObject({
      ticker: 'PRTAVAB', price: 1241.954039, currency: 'ARS', source: 'cafci',
    });
    await expect(fetchFciQuote('CONIOLA')).resolves.toMatchObject({
      ticker: 'CONIOLA', price: 179.598356, currency: 'ARS', source: 'cafci',
    });
    await expect(fetchFciQuote('IOLDOLD')).resolves.toMatchObject({
      ticker: 'IOLDOLD', price: 1.097744, currency: 'USD', source: 'cafci',
    });
    await expect(fetchFciQuote('ADCGLOA')).resolves.toMatchObject({
      ticker: 'ADCGLOA', price: 1.348784, currency: 'USD', source: 'cafci',
    });
  });

  it('falls back to the IOL public panel when CAFCI catalog cannot resolve the ticker', async () => {
    stubByUrl({
      catalog: { fondos: [] },
      iol: `
        <table>
          <tr>
            <td><a data-symbol="IOLDOLD ">IOLDOLD</a></td>
            <td>Renta Fija Dólares</td>
            <td class="text-right">US$ 1,10</td>
            <td>0,15%</td>
          </tr>
        </table>
      `,
    });
    await expect(fetchFciQuote('IOLDOLD')).resolves.toMatchObject({
      ticker: 'IOLDOLD', price: 1.1, currency: 'USD', source: 'iol',
    });
  });

  it('rethrows the CAFCI catalog 401 when IOL also fails', async () => {
    stubByUrl({ status: { catalog: 401, iol: 403 } });
    const err = await fetchFciQuote('IOLDOLD').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CafciHttpError);
    expect(err).toMatchObject({ status: 401, stage: 'catalog', message: 'CAFCI catalog 401' });
  });
});

describe('IOL fondos panel parser', () => {
  it('reads ticker, Argentine price and currency from a public table row', () => {
    const html = `
      <tr>
        <td class="links up">
          <a href="/Titulo/Index/144037" data-symbol="IOLDOLD                                           ">IOLDOLD</a>
        </td>
        <td>Renta Fija D&#243;lares</td>
        <td class="text-right">US$ 1,10</td>
        <td class="up text-right"><span class="tar ml5">0,15</span>%</td>
      </tr>
      <tr>
        <td><a data-symbol="PRTAVAB ">PRTAVAB</a></td>
        <td>Renta Variable Pesos</td>
        <td class="text-right">AR$ 1.241,95</td>
      </tr>
    `;
    const panel = parseIolFondosPanel(html);
    expect(panel.get('IOLDOLD')).toMatchObject({ price: 1.1, currency: 'USD', changePct: 0.15 });
    expect(panel.get('PRTAVAB')).toMatchObject({ price: 1241.95, currency: 'ARS' });
    expect(parseArgentineNumber('1.241,95')).toBeCloseTo(1241.95);
  });
});
