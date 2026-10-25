import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAFCI_HEADERS,
  CafciHttpError,
  fetchFciQuote,
  isCafciForbidden,
  firstCurrencyLabel,
  parseCafciCurrencyLabel,
  resetCafciCatalogCacheForTest,
  resolveCafciCurrencySources,
} from '@/lib/market-data/cafci-client';

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
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [...catalog, ...ambiguous] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { valorCuotaparte: null } }) }));
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
