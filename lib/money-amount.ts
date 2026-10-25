/** Exact money precision from a raw token or integer cents. Never float*100. */

function stripMoneyDecorations(raw: string): string {
  return raw
    .trim()
    .replace(/^[+-]\s*/, '')
    .replace(/^(ARS|USD|EUR|U\$S|US\$)\$?\s*/i, '')
    .replace(/^\$\s*/, '')
    .replace(/\s+/g, '');
}

function centsFromParts(whole: string, frac: string): bigint | null {
  if (frac.length > 2) return null;
  if (!/^\d+$/.test(whole) || (frac !== '' && !/^\d+$/.test(frac))) return null;
  try {
    return BigInt(whole) * BigInt(100) + BigInt(frac.padEnd(2, '0') || '0');
  } catch {
    return null;
  }
}

function centsFromSingleSeparator(token: string, sep: '.' | ','): bigint | null {
  const parts = token.split(sep);
  if (parts.length === 2) {
    return centsFromParts(parts[0] ?? '', parts[1] ?? '');
  }
  if (
    parts.length > 2 &&
    /^\d+$/.test(parts[0] ?? '') &&
    parts.slice(1).every((part) => part.length === 3 && /^\d+$/.test(part))
  ) {
    return centsFromParts(parts.join(''), '');
  }
  return null;
}

/**
 * Integer cents from the written token. More than two fractional digits → null
 * (40.129, 1.005). Grouped thousands (1.234.567 / 1,234,567) are whole amounts.
 * Mixed separators (1.234,56 / 1,234.56) keep at most two fraction digits.
 */
export function integerCentsFromToken(raw: string): bigint | null {
  const s = stripMoneyDecorations(raw);
  if (!s || /[eE]/.test(s) || !/^[\d.,]+$/.test(s)) return null;

  if (s.includes(',') && s.includes('.')) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    const decPos = Math.max(lastComma, lastDot);
    const thou = s[decPos] === ',' ? '.' : ',';
    const intRaw = s.slice(0, decPos);
    const frac = s.slice(decPos + 1);
    if (intRaw.includes(s[decPos] ?? '')) return null;
    const whole = intRaw.split(thou).join('');
    return centsFromParts(whole, frac);
  }
  if (s.includes(',') && !s.includes('.')) return centsFromSingleSeparator(s, ',');
  if (s.includes('.') && !s.includes(',')) return centsFromSingleSeparator(s, '.');
  return centsFromParts(s, '');
}

export function formatCents(cents: bigint): string {
  const sign = cents < BigInt(0) ? '-' : '';
  const abs = cents < BigInt(0) ? -cents : cents;
  const whole = abs / BigInt(100);
  const frac = abs % BigInt(100);
  return `${sign}${whole}.${frac.toString().padStart(2, '0')}`;
}

/** IEEE round-trip string. Scientific toString is rejected, never expanded. */
export function numberToDecimalString(value: number): string {
  if (!Number.isFinite(value)) return '';
  const abs = Math.abs(value);
  const s = abs.toString();
  if (/[eE]/.test(s)) return '';
  return s;
}

const JSON_AMOUNT_KEYS = ['amount', 'importe', 'value'] as const;

/** First `amount`/`importe`/`value` token in a JSON body, before JSON.parse. */
export function extractJsonNumberToken(
  rawJson: string,
  keys: readonly string[] = JSON_AMOUNT_KEYS
): string | null {
  const src = String(rawJson ?? '');
  if (!src) return null;
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const number = src.match(
      new RegExp(
        `"${escaped}"\\s*:\\s*(-?(?:0|[1-9]\\d*)(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)`,
        'i'
      )
    );
    if (number?.[1]) return number[1];
    const quoted = src.match(new RegExp(`"${escaped}"\\s*:\\s*"([^"]*)"`, 'i'));
    if (quoted?.[1] != null && quoted[1] !== '') return quoted[1];
  }
  return null;
}

export function hasAtMostTwoMoneyDecimals(value: unknown): boolean {
  if (typeof value === 'string') return integerCentsFromToken(value) != null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return false;
    return integerCentsFromToken(numberToDecimalString(value)) != null;
  }
  return false;
}

export function moneyAmountFromToken(raw: string): number | null {
  const cents = integerCentsFromToken(raw);
  if (cents == null) return null;
  return Number(cents / BigInt(100)) + Number(cents % BigInt(100)) / 100;
}
