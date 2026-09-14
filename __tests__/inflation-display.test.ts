import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

describe('IPC publicado confiable', () => {
  it('descarta porcentajes imposibles, valores infinitos y fechas inválidas', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [
      { fecha: '2026-01-01', valor: 2 }, { fecha: '2026-02-01', valor: Infinity },
      { fecha: '2026-03-01', valor: -100 }, { fecha: 'invalid', valor: 5 },
    ] }));
    const { getInflacionSeries, deflatorToToday } = await import('@/lib/services/inflacion');
    const series = await getInflacionSeries();
    expect(series).toEqual([{ fecha: '2026-01-01', valor: 2 }]);
    expect(deflatorToToday(series, '2025-12-01')).toBeCloseTo(1.02);
    expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
  it('devuelve serie vacía explícita si la fuente falla y no existe caché', async () => {
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Timeout')));
    const { getInflacionSeries } = await import('@/lib/services/inflacion');
    expect(await getInflacionSeries()).toEqual([]);
  });
});
