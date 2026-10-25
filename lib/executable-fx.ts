import type { DolarQuote, DolarRateType } from '@/lib/services/cotizaciones';

export class FxUnavailableError extends Error {
  readonly code = 'FX_UNAVAILABLE';

  constructor(pair: string) {
    super(`Cotización ${pair} no disponible, inválida o vencida`);
    this.name = 'FxUnavailableError';
  }
}

function configuredAge(value: string | undefined, fallbackSeconds: number): number {
  const seconds = Number(value);
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : fallbackSeconds) * 1000;
}

/** Display fallbacks may be older; monetary writes must validate the source time. */
export function isExecutableDolarQuote(
  quote: DolarQuote | undefined,
  type: DolarRateType | undefined = quote?.type
): quote is DolarQuote {
  if (!quote || !type) return false;
  const timestamp = quote.timestamp?.getTime();
  const maxAge = type === 'mep' ? 24 * 60 * 60 * 1000 : type === 'blue'
    ? configuredAge(process.env.EXCHANGE_RATE_MAX_AGE_SECONDS, 86400)
    : configuredAge(process.env.EXCHANGE_RATE_MARKET_MAX_AGE_SECONDS, 345600);
  return Number.isFinite(quote.buy) && quote.buy > 0 &&
    Number.isFinite(quote.sell) && quote.sell > 0 && Number.isFinite(timestamp) &&
    timestamp <= Date.now() + 5 * 60 * 1000 && Date.now() - timestamp <= maxAge;
}

export function requireExecutableDolarQuote(
  quote: DolarQuote | undefined,
  pair: string,
  type: DolarRateType | undefined = quote?.type
): DolarQuote {
  if (!isExecutableDolarQuote(quote, type)) throw new FxUnavailableError(pair);
  return quote;
}
