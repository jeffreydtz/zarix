/** Exact money precision from a raw token or integer cents. Never float*100. */

/** Sentence-final `.` / `,` / `.-` are punctuation, not part of the amount. */
export function stripTrailingMoneyPunct(token: string): string {
  return token.replace(/\.-+$/, '').replace(/[.,]+$/, '');
}

function stripMoneyDecorations(raw: string): { sign: bigint; token: string } {
  let s = raw.trim();
  let negative = false;
  const sign = s.match(/^([+-])\s*/);
  if (sign) {
    negative = sign[1] === '-';
    s = s.slice(sign[0].length);
  }
  s = s
    .replace(/^(ARS|USD|EUR|U\$S|US\$)\$?\s*/i, '')
    .replace(/^\$\s*/, '')
    .replace(/\s+/g, '');
  return { sign: negative ? BigInt(-1) : BigInt(1), token: stripTrailingMoneyPunct(s) };
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
    const frac = parts[1] ?? '';
    if (frac === '') return null;
    return centsFromParts(parts[0] ?? '', frac);
  }
  if (
    parts.length > 2 &&
    /^\d{1,3}$/.test(parts[0] ?? '') &&
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
  const { sign, token: s } = stripMoneyDecorations(raw);
  if (!s || /[eE]/.test(s) || /[xX]/.test(s) || !/^[\d.,]+$/.test(s)) return null;

  let cents: bigint | null;
  if (s.includes(',') && s.includes('.')) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    const decPos = Math.max(lastComma, lastDot);
    const thou = s[decPos] === ',' ? '.' : ',';
    const intRaw = s.slice(0, decPos);
    const frac = s.slice(decPos + 1);
    if (frac === '' || intRaw.includes(s[decPos] ?? '')) return null;
    const groups = intRaw.split(thou);
    if (
      groups.length > 1 &&
      (!/^\d{1,3}$/.test(groups[0] ?? '') ||
        groups.slice(1).some((group) => group.length !== 3 || !/^\d+$/.test(group)))
    ) {
      return null;
    }
    const whole = groups.join('');
    cents = centsFromParts(whole, frac);
  } else if (s.includes(',') && !s.includes('.')) {
    cents = centsFromSingleSeparator(s, ',');
  } else if (s.includes('.') && !s.includes(',')) {
    cents = centsFromSingleSeparator(s, '.');
  } else {
    cents = centsFromParts(s, '');
  }
  return cents == null ? null : cents * sign;
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

const JSON_AMOUNT_KEYS = ['amount', 'importe', 'value', 'monto'] as const;
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

/** Raw token for a JSON value used as money. Empty string = present but not a number/string amount. */
function jsonMoneyValueToken(src: string, i: number): string {
  if (src[i] === '"') {
    const str = parseJsonString(src, i);
    return str ? str.value : '';
  }
  const num = parseJsonNumberRaw(src, i);
  if (num) return num.raw;
  return '';
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
      const token = jsonMoneyValueToken(src, i);
      const prior = seen.get(keyLower);
      if (prior) {
        prior.duplicate = true;
      } else {
        const rec: JsonMoneyToken = {
          token,
          key: keyLower,
          duplicate: seen.size > 0,
          depth: ancestors.length,
        };
        if (seen.size > 0) {
          for (const existing of seen.values()) existing.duplicate = true;
        }
        seen.set(keyLower, rec);
        collect.push(rec);
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
  if (top.some((token) => token.duplicate) || new Set(top.map((token) => token.key)).size > 1) {
    const preferred =
      keys.map((key) => top.find((token) => token.key === key.toLowerCase())).find(Boolean) ?? top[0];
    return { token: preferred?.token || null, duplicate: true };
  }
  for (const key of keys) {
    const matches = top.filter((token) => token.key === key.toLowerCase());
    if (matches.length === 0) continue;
    return { token: matches[0]!.token || null, duplicate: false };
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
  const tokens = collectJsonMoneyTokens(rawJson);
  const top = tokens.filter((token) => token.depth === 0);
  if (new Set(top.map((token) => token.key)).size > 1) return true;
  return tokens.some(
    (token) => token.duplicate || !token.token || integerCentsFromToken(token.token) == null
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

/**
 * Web POST/PATCH amounts: only a finite number or a validated money string.
 * Booleans, arrays, objects, and non-positive values are rejected.
 */
export function positiveMoneyAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    const token = numberToDecimalString(value);
    if (!token) return null;
    const amount = moneyAmountFromToken(token);
    return amount != null && amount > 0 ? amount : null;
  }
  if (typeof value === 'string') {
    const amount = moneyAmountFromToken(value);
    return amount != null && amount > 0 ? amount : null;
  }
  return null;
}
