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

let cache: { data: InflacionMes[]; at: number } | null = null;

export async function getInflacionSeries(): Promise<InflacionMes[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const res = await fetch(API_URL, { next: { revalidate: 43200 }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`inflacion API ${res.status}`);
    const raw = (await res.json()) as Array<{ fecha: string; valor: number }>;
    const data = raw
      .filter((r) => r && Number.isFinite(r.valor) && r.valor > -100 && /^\d{4}-(0[1-9]|1[0-2])-01$/.test(r.fecha) && r.fecha <= new Date().toISOString().slice(0, 10))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (data.length === 0) throw new Error('Serie de inflación vacía o inválida');
    cache = { data, at: Date.now() };
    return data;
  } catch (e) {
    console.error('[inflacion] fetch error:', e);
    // Serie vieja es mejor que ninguna: la vista "reales" degrada a nominal
    // si no hay datos (factor 1).
    return cache?.data ?? [];
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
