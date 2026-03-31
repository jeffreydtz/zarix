export function formatCurrency(
  amount: number,
  currency: string,
  locale: string = 'es-AR'
): string {
  if (currency === 'BTC' || currency === 'ETH') {
    return `${amount.toFixed(8)} ${currency}`;
  }

  return `${currency === 'USD' ? 'USD' : '$'} ${amount.toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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
