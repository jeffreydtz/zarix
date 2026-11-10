import { createServiceClientSync } from '@/lib/supabase/server';
import { getNetWorthHistory, type NetWorthPoint } from '@/lib/services/net-worth';
import { investmentsService } from '@/lib/services/investments';
import { comparableLiquidArsBlue } from '@/lib/services/liquid-net-worth';
import { getInflacionSeriesWithMeta } from '@/lib/services/inflacion';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import { civilTodayYmd } from '@/lib/transaction-date';
import {
  inflationPctBetween,
  pctChange,
  periodWindow,
  pickOnOrBefore,
  realReturnPct,
  REAL_RETURN_PERIODS,
  simpleTnaPeriodPct,
  unavailable,
  type Comparison,
  type RealReturnsPeriodReport,
  type RealReturnsReport,
  type RealReturnsSubject,
} from '@/lib/real-returns';
import {
  caucionBenchmark,
  fciMoneyMarketQuote,
  fetchPlazoFijoBenchmark,
  loadUserBenchmarkSettings,
  resolvePlazoFijo,
} from '@/lib/services/benchmarks';

export type { RealReturnsPeriodReport, RealReturnsReport, RealReturnsSubject };

type FxDay = { dateISO: string; rate: number };

async function loadFxDailySeries(source: 'mep' | 'ccl', sinceISO: string): Promise<FxDay[]> {
  const supabase = createServiceClientSync();
  const { data, error } = await supabase
    .from('exchange_rates')
    .select('rate, timestamp')
    .eq('source', source)
    .eq('from_currency', 'USD')
    .eq('to_currency', 'ARS')
    .gte('timestamp', `${sinceISO}T00:00:00.000-03:00`)
    .order('timestamp', { ascending: true });
  if (error) throw error;
  const lastByDay = new Map<string, FxDay>();
  for (const row of data ?? []) {
    const dateISO = String(row.timestamp).slice(0, 10);
    const rate = Number(row.rate);
    if (!Number.isFinite(rate) || rate <= 0) continue;
    lastByDay.set(dateISO, { dateISO, rate });
  }
  return [...lastByDay.values()].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
}

function fxChange(
  series: FxDay[],
  startISO: string,
  endISO: string,
  live: { rate: number | null; asOf: string | null; source: string | null },
  id: 'mep' | 'ccl',
  label: string
): Comparison {
  const start = pickOnOrBefore(series, startISO);
  const end = pickOnOrBefore(series, endISO) ?? (
    live.rate != null && live.asOf
      ? { dateISO: live.asOf.slice(0, 10), rate: live.rate }
      : null
  );
  if (!start || !end) {
    const liveHint = live.rate != null
      ? ` Cotización actual: ${live.rate.toLocaleString('es-AR')}` +
        `${live.source ? ` (${live.source})` : ''}` +
        `${live.asOf ? ` · ${live.asOf.slice(0, 10)}` : ''}.`
      : '';
    return unavailable(
      id,
      label,
      `No hay serie histórica de ${label} para este período.${liveHint}`,
      live.source || id
    );
  }
  const pct = pctChange(start.rate, end.rate);
  if (pct == null) {
    return unavailable(id, label, `No se pudo calcular la variación de ${label}.`, live.source || id);
  }
  return {
    id,
    label,
    status: 'available',
    pct,
    source: live.source || `exchange_rates.${id}`,
    asOf: live.asOf || end.dateISO,
  };
}

function subjectFromSeries(
  id: RealReturnsSubject['id'],
  label: string,
  points: Array<{ dateISO: string; value: number | null }>,
  current: number | null,
  startISO: string,
  endISO: string,
  currency: 'ARS' | 'USD',
  inflationPct: number | null,
  mepPct: number | null,
  cclPct: number | null
): RealReturnsSubject {
  const startRow = pickOnOrBefore(
    points.filter((p): p is { dateISO: string; value: number } => p.value != null && Number.isFinite(p.value)),
    startISO
  );
  const endValue = current != null && Number.isFinite(current)
    ? current
    : pickOnOrBefore(
      points.filter((p): p is { dateISO: string; value: number } => p.value != null && Number.isFinite(p.value)),
      endISO
    )?.value ?? null;
  const startValue = startRow?.value ?? null;
  const nominalPct = startValue != null && endValue != null ? pctChange(startValue, endValue) : null;
  return {
    id,
    label,
    startValue,
    endValue,
    currency,
    nominalPct,
    realVsInflationPct: nominalPct != null && inflationPct != null
      ? realReturnPct(nominalPct, inflationPct)
      : null,
    vsMepPct: nominalPct != null && mepPct != null ? nominalPct - mepPct : null,
    vsCclPct: nominalPct != null && cclPct != null ? nominalPct - cclPct : null,
    startDate: startRow?.dateISO ?? null,
    endDate: endISO,
  };
}

export async function getRealReturnsReport(userId: string): Promise<RealReturnsReport> {
  const todayISO = civilTodayYmd();
  const [
    nwHistory,
    portfolioSnaps,
    inflacion,
    quotes,
    settings,
    plazoApi,
  ] = await Promise.all([
    getNetWorthHistory(userId, 3650),
    investmentsService.listPerformanceSnapshots(userId, 730),
    getInflacionSeriesWithMeta(),
    cotizacionesService.getDolarQuotes({ require: ['mep', 'ccl'] }).catch(() => null),
    loadUserBenchmarkSettings(userId),
    fetchPlazoFijoBenchmark(),
  ]);

  const firstNw = nwHistory[0]?.snapshot_date ?? null;
  const firstPf = portfolioSnaps[0]?.snapshot_date ?? null;
  const earliest = [firstNw, firstPf, todayISO].filter(Boolean).sort()[0] as string;
  const [mepSeries, cclSeries, fciMm] = await Promise.all([
    loadFxDailySeries('mep', earliest),
    loadFxDailySeries('ccl', earliest),
    fciMoneyMarketQuote(settings),
  ]);

  const mepLive = quotes?.mep ?? null;
  const cclLive = quotes?.ccl ?? null;
  const plazo = resolvePlazoFijo(plazoApi, settings);
  const caucion = caucionBenchmark(settings);

  const liquidPoints = nwHistory.map((p: NetWorthPoint) => ({
    dateISO: p.snapshot_date,
    value: comparableLiquidArsBlue(p),
  }));
  const liquidArsNow = nwHistory.length
    ? comparableLiquidArsBlue(nwHistory[nwHistory.length - 1])
    : null;

  const investmentUsdPoints = portfolioSnaps.map((p) => ({
    dateISO: p.snapshot_date,
    value: Number.isFinite(p.market_value_usd) ? p.market_value_usd : null,
  }));
  const investmentArsPoints = portfolioSnaps.map((p) => ({
    dateISO: p.snapshot_date,
    value: Number.isFinite(p.market_value_usd) && Number.isFinite(p.blue_ars_per_usd) && p.blue_ars_per_usd > 0
      ? p.market_value_usd * p.blue_ars_per_usd
      : null,
  }));
  const investmentsNow = investmentUsdPoints.length
    ? investmentUsdPoints[investmentUsdPoints.length - 1].value
    : null;
  const investmentsArsNow = investmentArsPoints.length
    ? investmentArsPoints[investmentArsPoints.length - 1].value
    : null;

  const periods: RealReturnsPeriodReport[] = [];
  for (const spec of REAL_RETURN_PERIODS) {
    const window = periodWindow(spec.id, todayISO, firstNw ?? firstPf);
    if (!window) continue;

    const inflationPct = inflationPctBetween(inflacion.series, window.startISO, window.endISO);
    const inflation: Comparison = inflationPct == null
      ? unavailable('inflation', 'Inflación INDEC', 'No hay IPC para este período.', inflacion.meta.source)
      : {
        id: 'inflation',
        label: 'Inflación INDEC',
        status: 'available',
        pct: inflationPct,
        source: inflacion.meta.source,
        asOf: inflacion.meta.lastFecha,
      };

    const mep = fxChange(mepSeries, window.startISO, window.endISO, {
      rate: mepLive?.sell ?? null,
      asOf: mepLive?.asOf?.toISOString() ?? mepLive?.timestamp?.toISOString() ?? null,
      source: mepLive?.provider ?? 'mep',
    }, 'mep', 'Dólar MEP');
    const ccl = fxChange(cclSeries, window.startISO, window.endISO, {
      rate: cclLive?.sell ?? null,
      asOf: cclLive?.asOf?.toISOString() ?? cclLive?.timestamp?.toISOString() ?? null,
      source: cclLive?.provider ?? 'ccl',
    }, 'ccl', 'Dólar CCL');

    const plazoCmp: Comparison = plazo.status === 'available' && plazo.tnaPct != null
      ? {
        id: 'plazo_fijo',
        label: plazo.label,
        status: 'available',
        pct: simpleTnaPeriodPct(plazo.tnaPct, window.days),
        source: plazo.source,
        asOf: plazo.asOf,
      }
      : unavailable('plazo_fijo', 'Plazo fijo', plazo.reason || 'Sin tasa.', plazo.source);

    const caucionCmp: Comparison = caucion.status === 'available' && caucion.tnaPct != null
      ? {
        id: 'caucion',
        label: caucion.label,
        status: 'available',
        pct: simpleTnaPeriodPct(caucion.tnaPct, window.days),
        source: caucion.source,
        asOf: caucion.asOf,
      }
      : unavailable('caucion', 'Caución', caucion.reason || 'Sin tasa.', caucion.source);

    const fciLabel = fciMm.ticker ? `FCI MM ${fciMm.ticker}` : 'FCI money market';
    const fciCmp: Comparison = fciMm.status === 'available'
      ? unavailable(
        'fci_mm',
        fciLabel,
        `NAV ${fciMm.nav}${fciMm.asOf ? ` · ${fciMm.asOf}` : ''} (${fciMm.source}). No hay serie histórica de cuotapartes; el cambio diario no se extrapola al período.`,
        fciMm.source
      )
      : unavailable('fci_mm', fciLabel, fciMm.reason || 'Sin ticker CAFCI.', fciMm.source);

    periods.push({
      period: spec.id,
      label: spec.label,
      startISO: window.startISO,
      endISO: window.endISO,
      days: window.days,
      liquid: subjectFromSeries(
        'liquid',
        'Patrimonio líquido',
        liquidPoints,
        liquidArsNow,
        window.startISO,
        window.endISO,
        'ARS',
        inflation.pct,
        mep.pct,
        ccl.pct
      ),
      investments: (() => {
        const usd = subjectFromSeries(
          'investments',
          'Inversiones',
          investmentUsdPoints,
          investmentsNow,
          window.startISO,
          window.endISO,
          'USD',
          null,
          null,
          null
        );
        const ars = subjectFromSeries(
          'investments',
          'Inversiones',
          investmentArsPoints,
          investmentsArsNow,
          window.startISO,
          window.endISO,
          'ARS',
          inflation.pct,
          mep.pct,
          ccl.pct
        );
        return {
          ...usd,
          realVsInflationPct: ars.realVsInflationPct,
          vsMepPct: ars.vsMepPct,
          vsCclPct: ars.vsCclPct,
        };
      })(),
      inflation,
      mep,
      ccl,
      plazoFijo: plazoCmp,
      caucion: caucionCmp,
      fciMm: fciCmp,
    });
  }

  return {
    todayISO,
    disclaimer:
      'Información comparativa con las fuentes indicadas. No es recomendación de inversión ni de rebalanceo.',
    inflationSource: {
      source: inflacion.meta.source,
      lastFecha: inflacion.meta.lastFecha,
    },
    quotes: {
      mep: {
        rate: mepLive?.sell ?? null,
        source: mepLive?.provider ?? null,
        asOf: mepLive?.asOf?.toISOString() ?? mepLive?.timestamp?.toISOString() ?? null,
      },
      ccl: {
        rate: cclLive?.sell ?? null,
        source: cclLive?.provider ?? null,
        asOf: cclLive?.asOf?.toISOString() ?? cclLive?.timestamp?.toISOString() ?? null,
      },
    },
    periods,
  };
}
