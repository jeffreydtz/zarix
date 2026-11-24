import type { InvestmentType } from '@/types/database';
import { INVESTMENT_TYPE_OPTIONS } from '@/lib/investments/type-meta';
import type { InvestmentWithPnL } from '@/lib/services/investments';

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  INVESTMENT_TYPE_OPTIONS.map((option) => [option.value, option.label])
);

export function investmentTypeLabel(type: string): string {
  return TYPE_LABELS[type] || type;
}

/** Crypto logo packs only know these bases; other tickers get initials + type badge. */
export const CRYPTO_LOGO_TICKERS = new Set([
  'BTC',
  'ETH',
  'USDT',
  'USDC',
  'DAI',
  'SOL',
  'BNB',
  'XRP',
  'ADA',
  'DOGE',
  'DOT',
  'AVAX',
  'MATIC',
  'LINK',
  'UNI',
]);

export function hasConfirmedMarketQuote(
  source: InvestmentWithPnL['valuation_price_source'] | undefined
): boolean {
  return source != null && source !== 'purchase_reference';
}

export function typeBadgeText(type: InvestmentType, ticker: string | null): string {
  if (type === 'crypto' && ticker && ticker.trim().toUpperCase() === 'BTC') return 'BTC';
  return investmentTypeLabel(type);
}
