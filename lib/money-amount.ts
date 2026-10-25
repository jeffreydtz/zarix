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
  if (!s || /[eE]/.test(s) || /[xX]/.test(s) || !/^[\d.,]+$/.test(s)) return null;

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
const MONEY_KEY_SET = new Set<string>(JSON_AMOUNT_KEYS);
/** Ancestors that may contain a money object (MCP JSON-RPC + batch writes). */
const MONEY_ANCESTORS = new Set(['params', 'arguments', 'transactions']);

export type JsonAmountExtract = {
  token: string | null;
  duplicate: boolean;
};

export type JsonMoneyToken = {
  token: string;
  key: string;
  duplicate: boolean;
  depth: number;
};

function skipWs(src: string, i: number): number {
  while (i < src.length && /\s/.test(src[i] ?? '')) i += 1;
  return i;
}

function parseJsonString(src: string, start: number): { value: string; end: number } | null {
  if (src[start] !== '"') return null;
  let i = start + 1;
  while (i < src.length) {
    if (src[i] === '\\') {
      i += 2;
      continue;
    }
    if (src[i] === '"') {
      try {
        return { value: JSON.parse(src.slice(start, i + 1)) as string, end: i + 1 };
      } catch {
        return null;
      }
    }
    i += 1;
  }
  return null;
}

function parseJsonNumberRaw(src: string, start: number): { raw: string; end: number } | null {
  const slice = src.slice(start);
  const m = slice.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
  if (!m) return null;
  return { raw: m[0], end: start + m[0].length };
}

function isMoneyContext(ancestors: readonly string[]): boolean {
  return ancestors.every((key) => MONEY_ANCESTORS.has(key) || /^\d+$/.test(key));
}

function skipJsonValue(
  src: string,
  start: number,
  ancestors: readonly string[],
  collect: JsonMoneyToken[] | null
): number {
  const i = skipWs(src, start);
  const c = src[i];
  if (c === '"') {
    const str = parseJsonString(src, i);
    return str ? str.end : src.length;
  }
  if (c === '{') return parseJsonObject(src, i, ancestors, collect);
  if (c === '[') return parseJsonArray(src, i, ancestors, collect);
  const num = parseJsonNumberRaw(src, i);
  if (num) return num.end;
  if (src.startsWith('true', i)) return i + 4;
  if (src.startsWith('false', i)) return i + 5;
  if (src.startsWith('null', i)) return i + 4;
  return Math.min(i + 1, src.length);
}

function parseJsonArray(
  src: string,
  start: number,
  ancestors: readonly string[],
  collect: JsonMoneyToken[] | null
): number {
  let i = start + 1;
  let index = 0;
  while (i < src.length) {
    i = skipWs(src, i);
    if (src[i] === ']') return i + 1;
    i = skipJsonValue(src, i, [...ancestors, String(index)], collect);
    index += 1;
    i = skipWs(src, i);
    if (src[i] === ',') {
      i += 1;
      continue;
    }
    if (src[i] === ']') return i + 1;
    break;
  }
  return i;
}

function parseJsonObject(
  src: string,
  start: number,
  ancestors: readonly string[],
  collect: JsonMoneyToken[] | null
): number {
  let i = start + 1;
  const seen = new Map<string, JsonMoneyToken>();
  while (i < src.length) {
    i = skipWs(src, i);
    if (src[i] === '}') return i + 1;
    const keyTok = parseJsonString(src, i);
    if (!keyTok) return src.length;
    const keyLower = keyTok.value.toLowerCase();
    i = skipWs(src, keyTok.end);
    if (src[i] !== ':') return src.length;
    i = skipWs(src, i + 1);
    const capture = Boolean(collect) && MONEY_KEY_SET.has(keyLower) && isMoneyContext(ancestors);
    if (capture && collect) {
      let token: string | null = null;
      if (src[i] === '"') {
        const str = parseJsonString(src, i);
        if (str && str.value !== '') token = str.value;
      } else if (src[i] !== 'n') {
        const num = parseJsonNumberRaw(src, i);
        if (num) token = num.raw;
      }
      if (token != null) {
        const prior = seen.get(keyLower);
        if (prior) {
          prior.duplicate = true;
        } else {
          const rec: JsonMoneyToken = { token, key: keyLower, duplicate: false, depth: ancestors.length };
          seen.set(keyLower, rec);
          collect.push(rec);
        }
      }
    }
    i = skipJsonValue(src, i, [...ancestors, keyLower], collect);
    i = skipWs(src, i);
    if (src[i] === ',') {
      i += 1;
      continue;
    }
    if (src[i] === '}') return i + 1;
    break;
  }
  return i;
}

function collectJsonMoneyTokens(rawJson: string): JsonMoneyToken[] {
  const src = String(rawJson ?? '');
  const collect: JsonMoneyToken[] = [];
  const start = skipWs(src, 0);
  if (src[start] === '{') parseJsonObject(src, start, [], collect);
  return collect;
}

/**
 * Top-level `amount`/`importe`/`value` token in a JSON body, before JSON.parse.
 * Nested keys (e.g. metadata.amount) are ignored. Duplicate top-level keys → duplicate.
 */
export function extractTopLevelJsonAmount(
  rawJson: string,
  keys: readonly string[] = JSON_AMOUNT_KEYS
): JsonAmountExtract {
  const top = collectJsonMoneyTokens(rawJson).filter((token) => token.depth === 0);
  for (const key of keys) {
    const matches = top.filter((token) => token.key === key.toLowerCase());
    if (matches.length === 0) continue;
    if (matches.some((token) => token.duplicate)) {
      return { token: matches[0]?.token ?? null, duplicate: true };
    }
    return { token: matches[0]!.token, duplicate: false };
  }
  return { token: null, duplicate: false };
}

/** First top-level amount token. Nested metadata.amount is ignored. */
export function extractJsonNumberToken(
  rawJson: string,
  keys: readonly string[] = JSON_AMOUNT_KEYS
): string | null {
  const extracted = extractTopLevelJsonAmount(rawJson, keys);
  if (extracted.duplicate) return extracted.token ? `${extracted.token}e0` : 'duplicate';
  return extracted.token;
}

/** True when a money field is exponent/hex/duplicate/malformed. */
export function rawJsonHasInvalidMoney(rawJson: string): boolean {
  return collectJsonMoneyTokens(rawJson).some(
    (token) => token.duplicate || integerCentsFromToken(token.token) == null
  );
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
