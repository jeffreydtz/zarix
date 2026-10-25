import { createServiceClientSync } from '@/lib/supabase/server';

export interface MarketSparklines {
  blue: number[];
  btc: number[];
  eth: number[];
}

interface ExchangeRateRow {
  rate: number;
  timestamp: string;
}

const DAYS_BACK = 7;

/**
 * Convierte filas de exchange_rates (múltiples muestras por día) en una serie
 * de ~1 punto por día: la última muestra de cada día, orden ascendente por fecha.
 */
function toDailySeries(rows: ExchangeRateRow[]): number[] {
  const lastByDay = new Map<string, ExchangeRateRow>();

  for (const row of rows) {
    const day = row.timestamp.slice(0, 10); // YYYY-MM-DD
    const existing = lastByDay.get(day);
    if (!existing || row.timestamp > existing.timestamp) {
      lastByDay.set(day, row);
    }
  }

  return Array.from(lastByDay.entries())
    .sort(([dayA], [dayB]) => (dayA < dayB ? -1 : dayA > dayB ? 1 : 0))
    .map(([, row]) => Number(row.rate));
}

async function fetchSeries(
  supabase: ReturnType<typeof createServiceClientSync>,
  params: { source: string; from: string; to: string }
): Promise<number[]> {
  const since = new Date();
  since.setDate(since.getDate() - DAYS_BACK);

  const { data, error } = await supabase
    .from('exchange_rates')
    .select('rate, timestamp')
    .eq('source', params.source)
    .eq('from_currency', params.from)
    .eq('to_currency', params.to)
    .gte('timestamp', since.toISOString())
    .order('timestamp', { ascending: true });

  if (error) throw error;
  if (!data) return [];

  return toDailySeries(data as ExchangeRateRow[]);
}

/**
 * Series de ~7 días (1 punto por día, el último del día) para el strip
 * "Mercado hoy" del dashboard: dólar blue (USD/ARS) y BTC/ETH (USD).
 * Arrays vacíos si no hay datos persistidos; los errores de DB se propagan.
 */
export async function getMarketSparklines(): Promise<MarketSparklines> {
  const supabase = createServiceClientSync();

  const [blue, btc, eth] = await Promise.all([
    fetchSeries(supabase, { source: 'blue', from: 'USD', to: 'ARS' }),
    fetchSeries(supabase, { source: 'coingecko', from: 'BTC', to: 'USD' }),
    fetchSeries(supabase, { source: 'coingecko', from: 'ETH', to: 'USD' }),
  ]);

  return { blue, btc, eth };
}
