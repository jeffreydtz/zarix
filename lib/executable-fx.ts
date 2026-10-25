import type { DolarQuote, DolarRateType } from '@/lib/services/cotizaciones';

export class FxUnavailableError extends Error {
  readonly code = 'FX_UNAVAILABLE';

  constructor(pair: string) {
    super(`Cotización ${pair} no disponible, inválida o vencida`);
    this.name = 'FxUnavailableError';
  }
}

/** Monetary writes never inherit the more permissive display/market-close settings. */
export const EXECUTABLE_FX_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Display fallbacks may be older; monetary writes must validate the source time. */
export function isExecutableDolarQuote(
  quote: DolarQuote | undefined,
  type: DolarRateType | undefined = quote?.type
): quote is DolarQuote {
  if (!quote || !type || quote.stale || quote.origin === 'persisted') return false;
  const timestamp = quote.timestamp?.getTime();
  return Number.isFinite(quote.buy) && quote.buy > 0 &&
    Number.isFinite(quote.sell) && quote.sell > 0 && Number.isFinite(timestamp) &&
    timestamp <= Date.now() + 5 * 60 * 1000 && Date.now() - timestamp <= EXECUTABLE_FX_MAX_AGE_MS;
}

export function requireExecutableDolarQuote(
  quote: DolarQuote | undefined,
  pair: string,
  type: DolarRateType | undefined = quote?.type
): DolarQuote {
  if (!isExecutableDolarQuote(quote, type)) throw new FxUnavailableError(pair);
  return quote;
}
