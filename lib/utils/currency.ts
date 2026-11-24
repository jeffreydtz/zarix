export const MONEY_LOCALE = 'es-AR';

export type FormatCurrencyOptions = {
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  /** Prefix a '+' for non-negative amounts (P&L). */
  signed?: boolean;
};

function resolveFormatOptions(
  localeOrOptions?: string | FormatCurrencyOptions
): Required<Pick<FormatCurrencyOptions, 'locale'>> & FormatCurrencyOptions {
  if (typeof localeOrOptions === 'string' || localeOrOptions == null) {
    return { locale: localeOrOptions || MONEY_LOCALE };
  }
  return { locale: MONEY_LOCALE, ...localeOrOptions };
}

function prefixForCurrency(currency: string): string {
  const c = (currency || 'ARS').toUpperCase();
  if (c === 'USD') return 'USD';
  if (c === 'EUR') return '€';
  if (c === 'ARS') return '$';
  return c;
}

/**
 * User-facing money for es-AR: "USD 1.127,17", "$ 6.210.468".
 * Third argument may be a locale string (legacy) or options.
 */
export function formatCurrency(
  amount: number,
  currency: string,
  localeOrOptions: string | FormatCurrencyOptions = MONEY_LOCALE
): string {
  const options = resolveFormatOptions(localeOrOptions);
  const locale = options.locale || MONEY_LOCALE;
  const c = (currency || 'ARS').toUpperCase();
  const sign = options.signed && amount > 0 ? '+' : '';

  if (c === 'BTC' || c === 'ETH') {
    const digits = options.maximumFractionDigits ?? 8;
    return `${sign}${amount.toLocaleString(locale, {
      minimumFractionDigits: options.minimumFractionDigits ?? digits,
      maximumFractionDigits: digits,
    })} ${c}`;
  }

  const explicitMin = options.minimumFractionDigits;
  const explicitMax = options.maximumFractionDigits;
  let min: number;
  let max: number;
  if (explicitMin != null || explicitMax != null) {
    min = explicitMin ?? explicitMax ?? 2;
    max = explicitMax ?? min;
  } else if (c === 'USD' || c === 'EUR') {
    min = 2;
    max = 2;
  } else {
    const cents = Math.round(Math.abs(amount) * 100) % 100;
    min = cents === 0 ? 0 : 2;
    max = cents === 0 ? 0 : 2;
  }
  return `${sign}${prefixForCurrency(c)} ${amount.toLocaleString(locale, {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  })}`;
}

export function parseCurrencyAmount(input: string): {
  amount: number;
  currency: string;
} | null {
  const lowerInput = input.toLowerCase().trim();

  const patterns = [
    { regex: /(\d+(?:\.\d+)?)\s*(?:usd|dólares?|dolares?|verdes)/, currency: 'USD' },
    { regex: /(\d+(?:\.\d+)?)\s*(?:btc|bitcoin)/, currency: 'BTC' },
    { regex: /(\d+(?:\.\d+)?)\s*(?:eth|ethereum)/, currency: 'ETH' },
    { regex: /(\d+(?:\.\d+)?)\s*(?:usdt|tether)/, currency: 'USDT' },
    { regex: /(\d+(?:\.\d+)?)k?/, currency: 'ARS' },
  ];

  for (const pattern of patterns) {
    const match = lowerInput.match(pattern.regex);
    if (match) {
      let amount = parseFloat(match[1]);

      if (lowerInput.includes('lucas') || lowerInput.includes('k')) {
        amount *= 1000;
      }

      if (lowerInput.includes('palo') || lowerInput.includes('millón') || lowerInput.includes('millon')) {
        amount *= 1000000;
      }

      return { amount, currency: pattern.currency };
    }
  }

  return null;
}

export function getStartOfMonth(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function getEndOfMonth(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
}

export function getMonthName(date: Date, locale: string = 'es-AR'): string {
  return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}
