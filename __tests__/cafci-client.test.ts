import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CAFCI_HEADERS,
  CafciHttpError,
  fetchFciQuote,
  isCafciForbidden,
  resetCafciCatalogCacheForTest,
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
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers['User-Agent']).toBe(CAFCI_HEADERS['User-Agent']);
    expect(init.headers['Accept-Language']).toBe(CAFCI_HEADERS['Accept-Language']);
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
});
