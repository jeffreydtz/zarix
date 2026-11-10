import { createServiceClientSync } from '@/lib/supabase/server';
import { fetchFciQuote } from '@/lib/market-data/cafci-client';

const PLAZO_FIJO_URL = 'https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo';
const FETCH_TIMEOUT_MS = 8000;

export interface UserBenchmarkSettings {
  plazo_fijo_tna: number | null;
  plazo_fijo_label: string | null;
  caucion_tna: number | null;
  caucion_label: string | null;
  fci_mm_ticker: string | null;
}

export const EMPTY_BENCHMARK_SETTINGS: UserBenchmarkSettings = {
  plazo_fijo_tna: null,
  plazo_fijo_label: null,
  caucion_tna: null,
  caucion_label: null,
  fci_mm_ticker: null,
};

export interface RateQuote {
  status: 'available' | 'unavailable';
  tnaPct: number | null;
  source: string;
  asOf: string | null;
  label: string;
  reason?: string;
}

export interface FciMmQuote {
  status: 'available' | 'unavailable';
  ticker: string | null;
  nav: number | null;
  changePct: number | null;
  source: string;
  asOf: string | null;
  fundType: string | null;
  reason?: string;
}

function finiteTna(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 400) return null;
  return n;
}

/**
 * Parsea la respuesta pública de argentinadatos. Prefiere Banco Nación; si no
 * hay entidad reconocible, toma el primer TNA finito. No promedia ni inventa.
 */
export function parsePlazoFijoPayload(raw: unknown): RateQuote {
  const rows = Array.isArray(raw) ? raw : [];
  const parsed: Array<{ entidad: string; tna: number; fecha: string | null }> = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const rec = row as Record<string, unknown>;
    const tna = finiteTna(rec.tna ?? rec.TNA ?? rec.valor);
    if (tna == null) continue;
    const entidad = String(rec.entidad ?? rec.banco ?? rec.nombre ?? '').trim();
    const fechaRaw = rec.fecha ?? rec.date ?? rec.ultimaFecha;
    const fecha = typeof fechaRaw === 'string' && fechaRaw ? fechaRaw : null;
    parsed.push({ entidad, tna, fecha });
  }
  if (parsed.length === 0) {
    return {
      status: 'unavailable',
      tnaPct: null,
      source: 'argentinadatos.com',
      asOf: null,
      label: 'Plazo fijo',
      reason: 'La API de tasas no devolvió un TNA usable.',
    };
  }
  const nacion = parsed.find((row) => /naci[oó]n/i.test(row.entidad));
  const pick = nacion ?? parsed[0];
  return {
    status: 'available',
    tnaPct: pick.tna,
    source: pick.entidad
      ? `argentinadatos.com · ${pick.entidad}`
      : 'argentinadatos.com',
    asOf: pick.fecha,
    label: pick.entidad ? `Plazo fijo (${pick.entidad})` : 'Plazo fijo',
  };
}

export async function fetchPlazoFijoBenchmark(): Promise<RateQuote> {
  const configured = finiteTna(process.env.BENCHMARK_PLAZO_FIJO_TNA);
  try {
    const res = await fetch(PLAZO_FIJO_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`plazo fijo API ${res.status}`);
    const quote = parsePlazoFijoPayload(await res.json());
    if (quote.status === 'available') return quote;
    if (configured != null) {
      return {
        status: 'available',
        tnaPct: configured,
        source: 'BENCHMARK_PLAZO_FIJO_TNA',
        asOf: null,
        label: 'Plazo fijo (configurado)',
      };
    }
    return quote;
  } catch {
    if (configured != null) {
      return {
        status: 'available',
        tnaPct: configured,
        source: 'BENCHMARK_PLAZO_FIJO_TNA',
        asOf: null,
        label: 'Plazo fijo (configurado)',
      };
    }
    return {
      status: 'unavailable',
      tnaPct: null,
      source: 'argentinadatos.com',
      asOf: null,
      label: 'Plazo fijo',
      reason: 'No hay una tasa de plazo fijo con fuente confiable ahora.',
    };
  }
}

export async function loadUserBenchmarkSettings(userId: string): Promise<UserBenchmarkSettings> {
  const supabase = createServiceClientSync();
  const { data, error } = await supabase
    .from('user_benchmark_settings')
    .select('plazo_fijo_tna, plazo_fijo_label, caucion_tna, caucion_label, fci_mm_ticker')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    // Preview still shares production Supabase: the table exists only after
    // this migration is applied on purpose. Missing relation → empty settings.
    if (/does not exist|42P01|schema cache/i.test(error.message || '')) {
      return { ...EMPTY_BENCHMARK_SETTINGS };
    }
    throw error;
  }
  if (!data) return { ...EMPTY_BENCHMARK_SETTINGS };
  return {
    plazo_fijo_tna: finiteTna(data.plazo_fijo_tna),
    plazo_fijo_label: typeof data.plazo_fijo_label === 'string' ? data.plazo_fijo_label : null,
    caucion_tna: finiteTna(data.caucion_tna),
    caucion_label: typeof data.caucion_label === 'string' ? data.caucion_label : null,
    fci_mm_ticker: typeof data.fci_mm_ticker === 'string' && data.fci_mm_ticker.trim()
      ? data.fci_mm_ticker.trim().toUpperCase()
      : null,
  };
}

export async function saveUserBenchmarkSettings(
  userId: string,
  patch: Partial<UserBenchmarkSettings>
): Promise<UserBenchmarkSettings> {
  const current = await loadUserBenchmarkSettings(userId);
  const next: UserBenchmarkSettings = {
    plazo_fijo_tna: patch.plazo_fijo_tna === undefined ? current.plazo_fijo_tna : finiteTna(patch.plazo_fijo_tna),
    plazo_fijo_label: patch.plazo_fijo_label === undefined
      ? current.plazo_fijo_label
      : (patch.plazo_fijo_label?.trim() || null),
    caucion_tna: patch.caucion_tna === undefined ? current.caucion_tna : finiteTna(patch.caucion_tna),
    caucion_label: patch.caucion_label === undefined
      ? current.caucion_label
      : (patch.caucion_label?.trim() || null),
    fci_mm_ticker: patch.fci_mm_ticker === undefined
      ? current.fci_mm_ticker
      : (patch.fci_mm_ticker?.trim().toUpperCase() || null),
  };
  const supabase = createServiceClientSync();
  const { error } = await supabase.from('user_benchmark_settings').upsert({
    user_id: userId,
    ...next,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return next;
}

export function caucionBenchmark(settings: UserBenchmarkSettings): RateQuote {
  const envTna = finiteTna(process.env.BENCHMARK_CAUCION_TNA);
  const tna = settings.caucion_tna ?? envTna;
  if (tna == null) {
    return {
      status: 'unavailable',
      tnaPct: null,
      source: 'sin fuente',
      asOf: null,
      label: 'Caución',
      reason: 'No hay una serie pública de caución. Cargá un TNA en Configuración o BENCHMARK_CAUCION_TNA.',
    };
  }
  const fromUser = settings.caucion_tna != null;
  return {
    status: 'available',
    tnaPct: tna,
    source: fromUser
      ? (settings.caucion_label?.trim() || 'TNA cargado por el usuario')
      : 'BENCHMARK_CAUCION_TNA',
    asOf: null,
    label: settings.caucion_label?.trim() || 'Caución',
  };
}

export async function fciMoneyMarketQuote(settings: UserBenchmarkSettings): Promise<FciMmQuote> {
  const ticker = settings.fci_mm_ticker || process.env.BENCHMARK_FCI_MM_TICKER?.trim().toUpperCase() || '';
  if (!ticker) {
    return {
      status: 'unavailable',
      ticker: null,
      nav: null,
      changePct: null,
      source: 'CAFCI',
      asOf: null,
      fundType: null,
      reason: 'Configurá un ticker CAFCI de money market. Zarix no inventa un índice.',
    };
  }
  try {
    const quote = await fetchFciQuote(ticker);
    if (!quote || !Number.isFinite(quote.price)) {
      return {
        status: 'unavailable',
        ticker,
        nav: null,
        changePct: null,
        source: 'CAFCI',
        asOf: null,
        fundType: null,
        reason: `CAFCI no devolvió NAV para ${ticker}.`,
      };
    }
    return {
      status: 'available',
      ticker,
      nav: quote.price,
      changePct: quote.changePct,
      source: quote.source === 'cafci' ? 'CAFCI' : quote.source.toUpperCase(),
      asOf: quote.timestamp,
      fundType: quote.fundType ?? null,
    };
  } catch {
    return {
      status: 'unavailable',
      ticker,
      nav: null,
      changePct: null,
      source: 'CAFCI',
      asOf: null,
      fundType: null,
      reason: `No se pudo consultar CAFCI para ${ticker}.`,
    };
  }
}

export function resolvePlazoFijo(apiQuote: RateQuote, settings: UserBenchmarkSettings): RateQuote {
  if (settings.plazo_fijo_tna != null) {
    return {
      status: 'available',
      tnaPct: settings.plazo_fijo_tna,
      source: settings.plazo_fijo_label?.trim() || 'TNA cargado por el usuario',
      asOf: null,
      label: settings.plazo_fijo_label?.trim() || 'Plazo fijo',
    };
  }
  return apiQuote;
}
