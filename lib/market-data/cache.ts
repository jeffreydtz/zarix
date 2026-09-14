import type { CryptoQuote, MarketSectionTimes, MarketStaleFlags, StockQuote } from '@/lib/market-data-types';

export interface MarketPayloadStored {
  crypto: CryptoQuote[];
  usStocks: StockQuote[];
  argStocks: StockQuote[];
  sectionTimes?: MarketSectionTimes;
  stale?: MarketStaleFlags;
}

const sections = ['crypto', 'usStocks', 'argStocks'] as const;
export function normalizeStoredPayload(raw: unknown): MarketPayloadStored | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<MarketPayloadStored>;
  const valid = <T extends { price: number }>(rows: T[] | undefined): T[] =>
    Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object' && Number.isFinite(r.price) && r.price > 0) : [];
  return {
    crypto: valid(p.crypto).filter((q) => typeof q.id === 'string' && typeof q.symbol === 'string'),
    usStocks: valid(p.usStocks).filter((q) => typeof q.ticker === 'string' && typeof q.name === 'string' &&
      !(q.ticker === '^IXIC' && (q.instrumentType === 'EQUITY' || q.name.includes('QQQ')))),
    argStocks: valid(p.argStocks).filter((q) => typeof q.ticker === 'string' && typeof q.name === 'string'),
    sectionTimes: p.sectionTimes,
    stale: p.stale,
  };
}

export function payloadHasAnyData(p: MarketPayloadStored): boolean {
  return sections.some((key) => p[key].length > 0);
}

/** Los bloques parciales conservan los instrumentos faltantes, con su aviso de caché. */
export function mergeWithCache(live: MarketPayloadStored, cached: MarketPayloadStored | null, nowIso: string): MarketPayloadStored & { stale: MarketStaleFlags; sectionTimes: MarketSectionTimes } {
  const stale = { crypto: false, usStocks: false, argStocks: false };
  const sectionTimes: MarketSectionTimes = {};
  const merge = <T extends { price: number; observedAt?: string; stale?: boolean }>(key: typeof sections[number], rows: T[], old: T[], id: (q: T) => string): T[] => {
    const byId = new Map(rows.map((q) => [id(q), q]));
    const reused = old.filter((q) => !byId.has(id(q)));
    const merged = [...rows, ...reused];
    stale[key] = !rows.length || reused.length > 0 || rows.some((q) => q.stale);
    // No convertir una respuesta vacía o reutilizada en una actualización nueva.
    const times = rows.map((q) => q.observedAt).filter((t): t is string => !!t && Number.isFinite(Date.parse(t)));
    if (reused.length || !rows.length) {
      const previous = cached?.sectionTimes?.[key];
      if (previous && Number.isFinite(Date.parse(previous))) times.push(previous);
    }
    sectionTimes[key] = times.length ? times.sort()[0] : rows.length ? nowIso : cached?.sectionTimes?.[key];
    return merged;
  };
  return {
    crypto: merge('crypto', live.crypto, cached?.crypto ?? [], (q) => q.id),
    usStocks: merge('usStocks', live.usStocks, cached?.usStocks ?? [], (q) => q.ticker),
    argStocks: merge('argStocks', live.argStocks, cached?.argStocks ?? [], (q) => q.ticker),
    stale, sectionTimes,
  };
}

export function cachedStaleFlags(payload: MarketPayloadStored, updatedAt: string): MarketStaleFlags {
  const flags = { crypto: false, usStocks: false, argStocks: false };
  for (const key of sections) {
    const observed = Date.parse(payload.sectionTimes?.[key] ?? updatedAt);
    flags[key] = !!payload.stale?.[key] || !payload[key].length || !Number.isFinite(observed) || Date.now() - observed > 15 * 60_000;
  }
  return flags;
}
