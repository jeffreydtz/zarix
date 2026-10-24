import type { AccountType, InvestmentType } from '@/types/database';

export const INVESTMENT_TYPES: readonly InvestmentType[] = [
  'stock_arg',
  'cedear',
  'stock_us',
  'etf',
  'crypto',
  'plazo_fijo',
  'fci',
  'bond',
  'on',
  'caucion',
  'real_estate',
  'other',
] as const;

export const INVESTMENT_TYPE_OPTIONS: { value: InvestmentType; label: string }[] = [
  { value: 'stock_us', label: 'Acción USA' },
  { value: 'etf', label: 'ETF (USA)' },
  { value: 'cedear', label: 'CEDEAR' },
  { value: 'stock_arg', label: 'Acción Argentina (BYMA)' },
  { value: 'crypto', label: 'Cripto' },
  { value: 'plazo_fijo', label: 'Plazo fijo' },
  { value: 'fci', label: 'FCI' },
  { value: 'bond', label: 'Bono soberano' },
  { value: 'on', label: 'ON (obligación negociable)' },
  { value: 'caucion', label: 'Caución' },
  { value: 'real_estate', label: 'Inmueble' },
  { value: 'other', label: 'Otro' },
];

const TICKER_TYPES = new Set<InvestmentType>([
  'stock_arg',
  'cedear',
  'stock_us',
  'etf',
  'crypto',
  'bond',
  'on',
  'fci',
]);

const ARG_LISTED_TYPES = new Set<InvestmentType>(['stock_arg', 'cedear', 'bond', 'on', 'fci']);

/** Bonos soberanos y ONs cotizan por VN 100. */
export function priceFactorForType(type: InvestmentType): number {
  return type === 'bond' || type === 'on' ? 100 : 1;
}

export function investmentNeedsTicker(type: InvestmentType): boolean {
  return TICKER_TYPES.has(type);
}

export function isArgentineListedType(type: InvestmentType): boolean {
  return ARG_LISTED_TYPES.has(type);
}

export function allowsMarketCurrencyOverride(type: InvestmentType): boolean {
  return type === 'cedear' || type === 'stock_arg' || type === 'bond' || type === 'on';
}

export function allowsBondFields(type: InvestmentType): boolean {
  return type === 'plazo_fijo' || type === 'caucion' || type === 'bond' || type === 'on';
}

export function marketCurrencyForInvestment(
  type: InvestmentType,
  purchaseCurrency: string | null
): string {
  switch (type) {
    case 'stock_arg':
    case 'cedear':
    case 'bond':
    case 'on':
      return 'ARS';
    case 'stock_us':
    case 'etf':
    case 'crypto':
      return 'USD';
    default:
      return (purchaseCurrency || 'USD').toUpperCase();
  }
}

/** Yahoo: listados BYMA usan `.BA`. ONs y FCI también; no omitir el sufijo. */
export function yahooSymbolFor(type: InvestmentType, ticker: string): string {
  const t = ticker.trim().toUpperCase();
  if (isArgentineListedType(type)) {
    return t.endsWith('.BA') ? t : `${t}.BA`;
  }
  return t;
}

/** Investment accounts hold any position; crypto accounts only hold crypto. */
export function accountCanHoldPosition(
  accountType: AccountType,
  positionType: InvestmentType
): boolean {
  if (accountType === 'investment') return true;
  return accountType === 'crypto' && positionType === 'crypto';
}
