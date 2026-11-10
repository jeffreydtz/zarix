import { describe, expect, it } from 'vitest';
import {
  inflationPctBetween,
  pctChange,
  periodWindow,
  pickOnOrBefore,
  realReturnPct,
  simpleTnaPeriodPct,
} from '@/lib/real-returns';
import { parsePlazoFijoPayload, caucionBenchmark, resolvePlazoFijo } from '@/lib/services/benchmarks';
import { EMPTY_BENCHMARK_SETTINGS } from '@/lib/services/benchmarks';

describe('real return math', () => {
  it('computes percent change and real return vs inflation', () => {
    expect(pctChange(100, 110)).toBeCloseTo(10);
    expect(realReturnPct(10, 4)).toBeCloseTo(((1.1 / 1.04) - 1) * 100);
  });

  it('applies Argentine TNA as simple interest over the period days', () => {
    expect(simpleTnaPeriodPct(36.5, 365)).toBeCloseTo(36.5);
    expect(simpleTnaPeriodPct(36.5, 30)).toBeCloseTo(3);
  });

  it('does not invent inflation when the series is empty', () => {
    expect(inflationPctBetween([], '2026-01-01', '2026-03-01')).toBeNull();
  });

  it('marks inflation unavailable when the period has no IPC months yet', () => {
    const series = [{ fecha: '2026-10-01', valor: 2.5 }];
    expect(inflationPctBetween(series, '2026-10-11', '2026-11-10')).toBeNull();
  });

  it('compounds IPC months after start through end inclusive', () => {
    const series = [
      { fecha: '2026-01-01', valor: 2 },
      { fecha: '2026-02-01', valor: 3 },
      { fecha: '2026-03-01', valor: 4 },
    ];
    // start January → months Feb and Mar
    const pct = inflationPctBetween(series, '2026-01-15', '2026-03-31');
    expect(pct).toBeCloseTo((1.03 * 1.04 - 1) * 100);
  });

  it('picks the last snapshot on or before the target day', () => {
    const rows = [
      { dateISO: '2026-01-01', value: 1 },
      { dateISO: '2026-01-10', value: 2 },
      { dateISO: '2026-02-01', value: 3 },
    ];
    expect(pickOnOrBefore(rows, '2026-01-15')?.value).toBe(2);
    expect(pickOnOrBefore(rows, '2025-12-31')).toBeNull();
  });

  it('builds month/quarter/year windows and since-start from the first snapshot', () => {
    expect(periodWindow('month', '2026-11-10', '2026-01-01')).toEqual({
      startISO: '2026-10-11',
      endISO: '2026-11-10',
      days: 30,
    });
    expect(periodWindow('since_start', '2026-11-10', '2026-01-01')?.startISO).toBe('2026-01-01');
    expect(periodWindow('since_start', '2026-11-10', null)).toBeNull();
  });
});

describe('benchmark sources stay honest', () => {
  it('parses argentinadatos plazo fijo and prefers Banco Nación', () => {
    const quote = parsePlazoFijoPayload([
      { entidad: 'Banco Galicia', tna: 30, fecha: '2026-11-01' },
      { entidad: 'Banco de la Nación Argentina', tna: 29, fecha: '2026-11-01' },
    ]);
    expect(quote.status).toBe('available');
    expect(quote.tnaPct).toBe(29);
    expect(quote.source).toMatch(/argentinadatos/i);
    expect(quote.source).toMatch(/Nación/i);
    expect(quote.asOf).toBe('2026-11-01');
  });

  it('marks plazo fijo unavailable when the payload has no TNA', () => {
    expect(parsePlazoFijoPayload([{ entidad: 'X' }]).status).toBe('unavailable');
    expect(parsePlazoFijoPayload(null).status).toBe('unavailable');
  });

  it('lets a user-supplied TNA override the public plazo fijo quote', () => {
    const api = parsePlazoFijoPayload([{ entidad: 'Banco Nación', tna: 29, fecha: '2026-11-01' }]);
    const resolved = resolvePlazoFijo(api, {
      ...EMPTY_BENCHMARK_SETTINGS,
      plazo_fijo_tna: 41,
      plazo_fijo_label: 'TNA BCRA (dato de ejemplo)',
    });
    expect(resolved.tnaPct).toBe(41);
    expect(resolved.source).toMatch(/ejemplo/i);
  });

  it('marks caución unavailable without a configured TNA', () => {
    const quote = caucionBenchmark(EMPTY_BENCHMARK_SETTINGS);
    expect(quote.status).toBe('unavailable');
    expect(quote.reason).toMatch(/caución/i);
  });

  it('uses the user caución TNA with the label as source', () => {
    const quote = caucionBenchmark({
      ...EMPTY_BENCHMARK_SETTINGS,
      caucion_tna: 12.5,
      caucion_label: 'MAE 1 día (dato de ejemplo)',
    });
    expect(quote.status).toBe('available');
    expect(quote.tnaPct).toBe(12.5);
    expect(quote.source).toMatch(/ejemplo/i);
  });
});
