// Índice de inflación mensual argentina (INDEC) vía argentinadatos.com.
// Alimenta la vista "ARS reales" del dashboard: re-expresa montos nominales
// históricos en pesos de HOY para responder la pregunta real de cualquier
// argentino: ¿le gané o le perdí a la inflación?
const API_URL = 'https://api.argentinadatos.com/v1/finanzas/indices/inflacion';
const TTL_MS = 12 * 60 * 60 * 1000; // el índice cambia una vez por mes

export interface InflacionMes {
  /** Primer día del mes, YYYY-MM-DD */
  fecha: string;
  /** Variación mensual en % (ej. 4.2) */
  valor: number;
}

export const INFLACION_SOURCE_LABEL = 'INDEC vía argentinadatos.com';
export const INFLACION_PROVIDER_URL = API_URL;

export interface InflacionSeriesMeta {
  source: string;
  providerUrl: string;
  lastFecha: string | null;
  fetchedAt: string | null;
}

let cache: { data: InflacionMes[]; at: number } | null = null;

function metaFrom(series: InflacionMes[], fetchedAt: number | null): InflacionSeriesMeta {
  return {
    source: INFLACION_SOURCE_LABEL,
    providerUrl: INFLACION_PROVIDER_URL,
    lastFecha: series.length ? series[series.length - 1].fecha : null,
    fetchedAt: fetchedAt ? new Date(fetchedAt).toISOString() : null,
  };
}

export async function getInflacionSeries(): Promise<InflacionMes[]> {
  const packed = await getInflacionSeriesWithMeta();
  return packed.series;
}

export async function getInflacionSeriesWithMeta(): Promise<{
  series: InflacionMes[];
  meta: InflacionSeriesMeta;
}> {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return { series: cache.data, meta: metaFrom(cache.data, cache.at) };
  }
  try {
    const timeoutMs = Number(process.env.MARKET_DATA_TIMEOUT_MS);
    const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 20_000) : 8_000;
    const res = await fetch(API_URL, {
      next: { revalidate: 43200 },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) throw new Error(`inflacion API ${res.status}`);
    const raw = (await res.json()) as Array<{ fecha: string; valor: number }>;
    const data = raw
      .filter((r) => r && typeof r.valor === 'number' && r.fecha)
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    cache = { data, at: Date.now() };
    return { series: data, meta: metaFrom(data, cache.at) };
  } catch (e) {
    console.error('[inflacion] fetch error:', e);
    // Serie vieja es mejor que ninguna: la vista "reales" degrada a nominal
    // si no hay datos (factor 1).
    const data = cache?.data ?? [];
    return { series: data, meta: metaFrom(data, cache?.at ?? null) };
  }
}

/**
 * Factor para llevar un monto nominal de `dateISO` a pesos de hoy:
 * producto de (1 + i/100) de los meses POSTERIORES al del monto.
 * Serie vacía o fecha futura → 1 (degrada a nominal).
 */
export function deflatorToToday(series: InflacionMes[], dateISO: string): number {
  if (series.length === 0) return 1;
  const month = dateISO.slice(0, 7);
  let factor = 1;
  for (const m of series) {
    if (m.fecha.slice(0, 7) > month) factor *= 1 + m.valor / 100;
  }
  return factor;
}
