import { parseTransactionCurrency } from '@/lib/constants/transaction-currencies';
import {
  extractTopLevelJsonAmount,
  integerCentsFromToken,
  moneyAmountFromToken,
  numberToDecimalString,
  stripTrailingMoneyPunct,
} from '@/lib/money-amount';

const CREDIT_CARD_PHRASE = /tarjeta\s+de\s+cr[eé]dito|credit\s+card/gi;
const PAGASTE_CON_SALDO_RE = /\bpag[aá]ste\s+con\s+saldo\b/gi;

/** ISO codes and symbols that are not ARS/USD/EUR. Word tokens only — never silent ARS. */
const UNSUPPORTED_ISO =
  /\b(GBP|JPY|BRL|CLP|UYU|MXN|CAD|CHF|CNY|AUD|NZD|KRW|PEN|COP|BOB|PYG|CRC|GTQ|HNL|NIO|PAB|DOP|INR|ZAR|SEK|NOK|DKK|PLN|CZK|HUF|TRY|RUB|SGD|HKD|TWD|THB|IDR|MYR|PHP|VND|ILS|AED|SAR|EGP|NGN)\b/i;

export function detectUnsupportedCurrencyInText(text: string): string | null {
  const iso = text.match(UNSUPPORTED_ISO);
  if (iso) return iso[1].toUpperCase();
  if (/[£₤]|GB£/.test(text)) return 'GBP';
  if (/¥/.test(text)) return 'JPY';
  return null;
}

export type WalletIngestPayload = {
  amount: number | null;
  currency: string;
  merchant: string | null;
  cardName: string | null;
  occurredAt: string | null;
  rawText: string | null;
  amountAmbiguous: boolean;
  currencyUnsupported: boolean;
  direction: 'expense' | 'income';
  excessDecimals?: boolean;
  amountDuplicate?: boolean;
};

export type AmountParseResult = {
  amount: number | null;
  ambiguous: boolean;
  direction: 'expense' | 'income';
  excessDecimals?: boolean;
  currency?: string;
};

const MAX_TEXT = 4000;
const MAX_AMOUNT = 1_000_000_000;
const LAST4_CONTEXT =
  /(?:terminad[ao]s?\s+en|ending\s+in|últimos?\s*(?:4|cuatro)|last\s*(?:4|four)|n[úu]mero\s+\*+|tarjeta\s+(?:terminad[ao]a?\s+en)?)\s*[\d*]{2,6}/gi;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function jsonText(json: Record<string, unknown> | null, truncate = true): string | null {
  if (!json) return null;
  const raw = json.rawText ?? json.text ?? json.body ?? json.notification;
  if (typeof raw !== 'string') return null;
  return truncate ? raw.slice(0, MAX_TEXT) : raw;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, 160) : null;
}

function localeHintFromText(text: string): 'AR' | 'US' | 'unknown' {
  if (/\bUSD\b|U\$S|US\$/i.test(text)) return 'US';
  if (/\bARS\b|\bEUR\b/i.test(text) || /(?:^|[^\w])\$/.test(text)) return 'AR';
  return 'unknown';
}

function parsedMoney(
  n: number,
  raw: string,
  ambiguous: boolean
): { value: number; ambiguous: boolean; excessDecimals?: boolean } | null {
  if (!Number.isFinite(n)) return null;
  if (integerCentsFromToken(raw) == null) {
    return { value: n, ambiguous: true, excessDecimals: true };
  }
  const exact = moneyAmountFromToken(raw);
  return { value: exact ?? round2(n), ambiguous };
}

function parseGroupedNumber(
  raw: string,
  localeHint: 'AR' | 'US' | 'unknown'
): { value: number; ambiguous: boolean; excessDecimals?: boolean } | null {
  const s = stripTrailingMoneyPunct(raw.replace(/\s/g, ''));
  if (!s) return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      const n = Number(s.replace(/\./g, '').replace(',', '.'));
      return parsedMoney(n, s, false);
    }
    const n = Number(s.replace(/,/g, ''));
    return parsedMoney(n, s, false);
  }

  if (hasComma && !hasDot) {
    const parts = s.split(',');
    const frac = parts[parts.length - 1] ?? '';
    if (parts.length === 2 && frac.length <= 2) {
      const n = Number(s.replace(',', '.'));
      return parsedMoney(n, s, false);
    }
    if (frac.length === 3 && parts.every((p, i) => i === 0 || p.length === 3)) {
      const n = Number(s.replace(/,/g, ''));
      return parsedMoney(n, s, false);
    }
    return null;
  }

  if (hasDot && !hasComma) {
    const parts = s.split('.');
    const frac = parts[parts.length - 1] ?? '';
    if (parts.length > 2) {
      if (parts.slice(1).every((p) => p.length === 3)) {
        const n = Number(s.replace(/\./g, ''));
        return parsedMoney(n, s, false);
      }
      return null;
    }
    if (frac.length === 3) {
      if (localeHint === 'US') {
        if (integerCentsFromToken(s) == null) {
          const asDecimal = Number(s);
          if (!Number.isFinite(asDecimal)) return null;
          return { value: asDecimal, ambiguous: true, excessDecimals: true };
        }
        const exact = moneyAmountFromToken(s);
        if (exact == null) return null;
        return { value: exact, ambiguous: true };
      }
      const n = Number(s.replace(/\./g, ''));
      if (!Number.isFinite(n)) return null;
      return parsedMoney(n, s.replace(/\./g, ''), localeHint === 'unknown');
    }
    if (frac.length <= 2) {
      const n = Number(s);
      return parsedMoney(n, s, false);
    }
    if (frac.length > 2) {
      const n = Number(s);
      if (!Number.isFinite(n)) return null;
      return { value: n, ambiguous: true, excessDecimals: true };
    }
    return null;
  }

  const n = Number(s);
  return parsedMoney(n, s, false);
}

const ISO_CODE = 'ARS|USD|EUR';
const SYMBOL_CODE = 'U\\$S|US\\$|U\\$D|AR\\$';
const PREFIX_TOKEN = `(?:\\b(?:${ISO_CODE})\\b|(?:${SYMBOL_CODE}))`;
const CANDIDATE_RE = new RegExp(
  `(?<![A-Za-z\\d])([+-])?\\s*(?:(${PREFIX_TOKEN})\\s*:?\\s*\\$?|(\\$))?\\s*((?:0[xX][0-9A-Fa-f]+|[.,]\\d+|\\d{1,3}(?:[.\\s]\\d{3})+(?:,\\d{1,2})?|\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+[.,]\\d+|\\d{1,12})(?:[eE][+-]?\\d+)?)`,
  'gi'
);

const MARKER_SUFFIX_RE = new RegExp(`^(${PREFIX_TOKEN})`, 'i');
const MARKER_ANY_RE = new RegExp(`${PREFIX_TOKEN}|\\$`, 'gi');
const FORMAT_CHAR_RE = /\p{Cf}/u;
const OTHER_DASH_RE = /[^\P{Pd}-]|\u2212/u;
const SUPERSCRIPT_RE = /[\u00B9\u00B2\u00B3\u2070-\u2079]/;
const URL_EMAIL_RE = /https?:\/\/\S+|www\.\S+|\S+@\S+/gi;
const HARD_DENY_RE =
  /\breintegr|\bdevol|\bdevuelt|\breembols|\brembols|\brefund|\brevers|\bcontracargo|\bcr[eé]dit|\bacredit|\bcashback|\brecib|\bcobr|transfirieron|no\s+(?:fue\s+)?aprobad[oa]|no\s+realiz|no\s+autoriz|\brechaz|\bdeneg|\bdeclin|\bfall|\banul|\bcancel|sin\s+fondos|\bm[ií]nimo|\ba\s+pagar\b|\bvencim|\bvenc|\bprogram|en\s+proceso|\bpendient|preautoriz|\breserva|\bretenc|\bintento|\bahorr|\bdescuent|\bpropina|por\s+mes|\/mes|\bsaldo\b|\bdisponible\b|\bl[ií]mite\b|\bcuota|\bIVA\b|I\.V\.A|c\s*\/\s*u\b|\bdesde\b|\bhasta\b|available\s+balance|no\s+(?:pag[aá]ste|compr[aá]ste|transferiste|abonaste|consumiste)|si\s+(?:pag[aá]ste|compr[aá]ste)|\bseña\b|\badelanto\b|\bimpuesto|\bbonific|\binteres|\d+\s*%/i;
const INSTALLMENT_RE = /\bcuotas?\b|\b\d+\s*x\s*\d*\b|\bx\s*\d+\b/i;
const GLUED_DATE_TIME_RE = /^(?:[:/]\s*\d|\s*[:/-]\s*\d)/;
const GLUED_DATE_TIME_SPAN_RE = /^(?:[:/]\s*\d+|\s*[:/-]\s*\d+)+/;
const SPLIT_CENTS_RE = /^\s*,\s*\d{1,2}\b/;
const SPLIT_SPACE_CENTS_RE = /^(?:\s+[.,]?\s*|\s*\.\s+)\d{1,2}\b/;
const SCALE_WORD_RE = /^(?:\s*(?:mil|millones?)\b|\s*[Mmk]\b)/;
const AFTER_AMOUNT_DENY_RE = /^(?:\s*(?:\+|m[aá]s)\s*IVA\b|\s*IVA\b|\s*c\/u\b|\s*por\s+unidad\b|\s*\/u\b)/i;
const ALLOW_RE =
  /pag[aá]ste|compr[aá]ste|transferiste|abonaste|consumiste|compra\s+aprobada|compra\s+realizada|pago\s+realizado|pago\s+aprobado/gi;
const CURRENCY_WORD_RE = /\b(d[oó]lar\w*|dollars?|euros?|pesos?(?:\s+\w+)?)\b/gi;
const CODE_BEFORE_RE = /[A-Za-z0-9][-_/@?=&]$/;
const CODE_SCAN_RE = new RegExp(PREFIX_TOKEN, 'gi');
const PREFIX_REST_OK = /^\s*(:(?!:))?\s*\$?\s*\d/;
const PREFIX_REST_JUNK = /^\s*(?:[-+()/:;=#.,]+|\(\s*[+\-]?)(?:\s*[-+()])?\s*\d/;

function spaceMask(re: RegExp, text: string): string {
  return text.replace(re, (m) => ' '.repeat(m.length));
}

function markerCurrency(marker: string): 'ARS' | 'USD' | 'EUR' {
  const compact = marker.replace(/\s+/g, '');
  if (/^(USD|US\$|U\$S|U\$D)$/i.test(compact)) return 'USD';
  if (/^EUR$/i.test(compact)) return 'EUR';
  return 'ARS';
}

/** Bare `$` is a money marker, not an ARS claim. Codes (USD, US$, ARS, …) set currency. */
function codeCurrency(marker: string): 'ARS' | 'USD' | 'EUR' | null {
  if (!marker || marker === '$') return null;
  return markerCurrency(marker);
}

function localeFromMarker(marker: string): 'AR' | 'US' {
  return markerCurrency(marker) === 'USD' ? 'US' : 'AR';
}

function isBareDollarDotDecimal(marker: string, token: string): boolean {
  if (marker !== '$') return false;
  return /^\d+\.\d{1,2}$/.test(stripTrailingMoneyPunct(token.replace(/\s/g, '')));
}

function parkAmount(
  direction: 'expense' | 'income' = 'expense',
  extra?: { excessDecimals?: boolean; amount?: number | null; currency?: string }
): AmountParseResult {
  return {
    amount: extra?.amount ?? null,
    ambiguous: true,
    direction,
    excessDecimals: extra?.excessDecimals,
    currency: extra?.currency,
  };
}

function maskSentenceNoise(src: string): string {
  return src
    .replace(/\bS\.A\.?/gi, (m) => ' '.repeat(m.length))
    .replace(/\bNro\.?/gi, (m) => ' '.repeat(m.length))
    .replace(/\bAv\.?/gi, (m) => ' '.repeat(m.length))
    .replace(/\d{1,3}(?:\.\d{3})+/g, (m) => ' '.repeat(m.length));
}

function sentenceStart(src: string, amountIndex: number): number {
  const masked = maskSentenceNoise(src);
  const sentenceBreak = Math.max(
    masked.lastIndexOf('.', amountIndex),
    masked.lastIndexOf('!', amountIndex),
    masked.lastIndexOf('?', amountIndex)
  );
  return sentenceBreak + 1;
}

function hasAllowlistedExpense(src: string, amountIndex: number): boolean {
  const window = src.slice(sentenceStart(src, amountIndex), amountIndex);
  ALLOW_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ALLOW_RE.exec(window))) {
    const before = window.slice(Math.max(0, m.index - 4), m.index);
    if (/\bno\s+$/i.test(before) || /\bsi\s+$/i.test(before)) continue;
    return true;
  }
  return false;
}

function prefixRestIsJunk(rest: string): boolean {
  if (PREFIX_REST_OK.test(rest)) return false;
  return PREFIX_REST_JUNK.test(rest);
}

function hasJunkAfterCurrencyCode(src: string): boolean {
  CODE_SCAN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CODE_SCAN_RE.exec(src))) {
    if (prefixRestIsJunk(src.slice(m.index + m[0].length))) return true;
  }
  return false;
}

function denySrcFor(text: string): string {
  return spaceMask(CREDIT_CARD_PHRASE, spaceMask(URL_EMAIL_RE, text)).replace(PAGASTE_CON_SALDO_RE, 'pagaste');
}

/** Length / format / deny-root / installment veto. Used for free-text and JSON+rawText. */
export function textFailsAutoConfirmGates(text: string): boolean {
  if (text.length > MAX_TEXT) return true;
  if (FORMAT_CHAR_RE.test(text) || OTHER_DASH_RE.test(text)) return true;
  if (SUPERSCRIPT_RE.test(text)) return true;
  if (INSTALLMENT_RE.test(text)) return true;
  return HARD_DENY_RE.test(denySrcFor(text));
}

function currencyWordDisagrees(src: string, currency: 'ARS' | 'USD' | 'EUR'): boolean {
  CURRENCY_WORD_RE.lastIndex = 0;
  const words = [...src.matchAll(CURRENCY_WORD_RE)].map((m) => (m[1] || '').toLowerCase());
  if (words.length === 0) return false;
  if (words.some((w) => /chilen|uruguay/.test(w))) return true;
  const wantsUsd = words.some((w) => /d[oó]lar|dollar/.test(w));
  const wantsEur = words.some((w) => /euro/.test(w));
  const wantsArs = words.some((w) => /peso/.test(w));
  if ([wantsUsd, wantsEur, wantsArs].filter(Boolean).length > 1) return true;
  if (wantsUsd) return currency !== 'USD';
  if (wantsEur) return currency !== 'EUR';
  if (wantsArs) return currency !== 'ARS';
  return false;
}

function hasUnattachedMarker(src: string, consumedStart: number, consumedEnd: number): boolean {
  const masked = src.slice(0, consumedStart) + ' '.repeat(Math.max(0, consumedEnd - consumedStart)) + src.slice(consumedEnd);
  MARKER_ANY_RE.lastIndex = 0;
  return MARKER_ANY_RE.test(masked);
}

/**
 * Allowlist Wallet free-text gate. A candidate counts only with an explicit
 * currency marker and a fully valid token. Auto-confirm requires exactly one
 * such candidate AND a completed past-tense template in the same sentence,
 * with no denylist/income signal. Unmarked numbers and numbers before a
 * marker are never the amount.
 */
export function parseAmountFromText(text: string): AmountParseResult {
  if (textFailsAutoConfirmGates(text)) return parkAmount();

  const src = text.replace(/[\u00a0\u202f\u2009]/g, ' ');
  const stripped = spaceMask(CREDIT_CARD_PHRASE, spaceMask(URL_EMAIL_RE, spaceMask(LAST4_CONTEXT, src)));
  let invalidMarked = hasJunkAfterCurrencyCode(stripped);

  type Marked = {
    raw: string;
    signed: boolean;
    currency: 'ARS' | 'USD' | 'EUR';
    marker: string;
    start: number;
    end: number;
    after: string;
  };
  const valid: Marked[] = [];
  CANDIDATE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CANDIDATE_RE.exec(stripped))) {
    if (CODE_BEFORE_RE.test(stripped.slice(Math.max(0, m.index - 2), m.index))) {
      CANDIDATE_RE.lastIndex = Math.max(CANDIDATE_RE.lastIndex, m.index + m[0].length);
      continue;
    }
    const group4 = m[4] || '';
    let digits = group4.replace(/\s/g, '');
    let tokenEnd = m.index + m[0].length;
    const after = stripped.slice(tokenEnd);
    const prefixMarker = m[2] || m[3] || '';
    const markedHere = Boolean(prefixMarker) || MARKER_SUFFIX_RE.test(after.trimStart());
    if (/^[eExX]/.test(after) || GLUED_DATE_TIME_RE.test(after)) {
      if (markedHere) invalidMarked = true;
      const span = after.match(GLUED_DATE_TIME_SPAN_RE);
      tokenEnd += span?.[0].length ?? 0;
      CANDIDATE_RE.lastIndex = Math.max(CANDIDATE_RE.lastIndex, tokenEnd);
      continue;
    }
    if (SPLIT_CENTS_RE.test(after) || SPLIT_SPACE_CENTS_RE.test(after)) {
      if (markedHere) invalidMarked = true;
      CANDIDATE_RE.lastIndex = Math.max(CANDIDATE_RE.lastIndex, tokenEnd);
      continue;
    }
    const extraJunk = after.match(/^[._]*\d[\d._]*/);
    if (extraJunk) {
      digits += extraJunk[0];
      tokenEnd += extraJunk[0].length;
    }
    const afterToken = stripped.slice(tokenEnd);
    const trimmedAfter = afterToken.trimStart();
    const suffix = trimmedAfter.match(MARKER_SUFFIX_RE);
    let suffixMarker = '';
    let suffixConsumed = 0;
    if (suffix) {
      const rest = trimmedAfter.slice(suffix[0].length);
      if (PREFIX_REST_OK.test(rest) || prefixRestIsJunk(rest)) {
        // Code is a prefix of the following number (or junk after the code), never a suffix of this one.
        suffixMarker = '';
      } else if (prefixMarker) {
        suffixMarker = suffix[1] || suffix[0] || '';
        suffixConsumed = afterToken.indexOf(suffix[0]!) + suffix[0]!.length;
      }
    }
    if (!prefixMarker) {
      CANDIDATE_RE.lastIndex = Math.max(CANDIDATE_RE.lastIndex, tokenEnd);
      continue;
    }
    digits = stripTrailingMoneyPunct(digits);
    const consumedEnd = suffixConsumed ? tokenEnd + suffixConsumed : tokenEnd;
    CANDIDATE_RE.lastIndex = Math.max(CANDIDATE_RE.lastIndex, consumedEnd);
    const prefixCode = codeCurrency(prefixMarker);
    const suffixCode = codeCurrency(suffixMarker);
    if (prefixCode && suffixCode && prefixCode !== suffixCode) {
      invalidMarked = true;
      continue;
    }
    const marker = prefixCode ? prefixMarker : suffixMarker || prefixMarker;
    const currency = prefixCode ?? suffixCode ?? 'ARS';
    if (
      !digits ||
      /[:/eExX]/.test(digits) ||
      /^0[xX]/i.test(digits) ||
      (currency === 'ARS' && isBareDollarDotDecimal('$', digits))
    ) {
      invalidMarked = true;
      continue;
    }
    const afterAmount = stripped.slice(consumedEnd);
    if (SCALE_WORD_RE.test(afterAmount) || AFTER_AMOUNT_DENY_RE.test(afterAmount)) {
      invalidMarked = true;
      continue;
    }
    valid.push({
      raw: digits,
      signed: m[1] === '-',
      currency,
      marker,
      start: m.index,
      end: consumedEnd,
      after: afterAmount,
    });
  }

  if (invalidMarked || valid.length !== 1) {
    return parkAmount(valid.some((c) => c.signed) ? 'income' : 'expense');
  }

  const preferred = valid[0]!;
  const parsed = parseGroupedNumber(preferred.raw, localeFromMarker(preferred.marker));
  const direction: 'expense' | 'income' = preferred.signed ? 'income' : 'expense';
  if (parsed?.excessDecimals) {
    return parkAmount(direction, { excessDecimals: true });
  }
  if (!parsed || parsed.ambiguous || !(parsed.value > 0) || parsed.value > MAX_AMOUNT) {
    return parkAmount(direction);
  }

  const leftover = hasUnattachedMarker(stripped, preferred.start, preferred.end);
  const disagree = currencyWordDisagrees(src, preferred.currency);
  const allow =
    !preferred.signed &&
    !leftover &&
    !disagree &&
    hasAllowlistedExpense(stripped, preferred.start);

  return {
    amount: parsed.value,
    ambiguous: !allow,
    direction,
    currency: preferred.currency,
  };
}

function parseAmountValue(v: unknown, amountToken?: string | null): AmountParseResult {
  const token = typeof amountToken === 'string' && amountToken.trim() ? amountToken.trim() : null;
  if (token) {
    const signed = /^\s*-/.test(token) || (typeof v === 'number' && v < 0);
    const direction: 'expense' | 'income' = signed ? 'income' : 'expense';
    const cents = integerCentsFromToken(token);
    if (cents == null) {
      const grouped = parseGroupedNumber(
        token
          .replace(/^[+-]\s*/, '')
          .replace(/^(ARS|USD|EUR|U\$S|US\$)\$?\s*/i, '')
          .replace(/^\$\s*/, '')
          .replace(/\s+/g, ''),
        localeHintFromText(token) === 'unknown' ? 'US' : localeHintFromText(token)
      );
      if (grouped?.excessDecimals) {
        return { amount: null, ambiguous: true, direction, excessDecimals: true };
      }
      if (typeof v === 'string') {
        return parseAmountValue(v);
      }
      return { amount: null, ambiguous: true, direction, excessDecimals: true };
    }
    const parsedAmount = moneyAmountFromToken(token);
    const amount = parsedAmount == null ? null : Math.abs(parsedAmount);
    if (amount == null || !(amount > 0) || amount > MAX_AMOUNT) {
      return { amount: null, ambiguous: false, direction: 'expense' };
    }
    return { amount, ambiguous: false, direction };
  }
  if (typeof v === 'number' && Number.isFinite(v)) {
    const abs = Math.abs(v);
    const direction: 'expense' | 'income' = v < 0 ? 'income' : 'expense';
    if (!(abs > 0) || abs > MAX_AMOUNT) return { amount: null, ambiguous: false, direction: 'expense' };
    const tokenFromNumber = numberToDecimalString(abs);
    const amount = integerCentsFromToken(tokenFromNumber) != null ? moneyAmountFromToken(tokenFromNumber) : null;
    if (amount == null) {
      return { amount: null, ambiguous: true, direction, excessDecimals: true };
    }
    return { amount, ambiguous: false, direction };
  }
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return { amount: null, ambiguous: false, direction: 'expense' };
    const signed = /^\s*-/.test(trimmed);
    const hint = localeHintFromText(trimmed);
    const numeric = trimmed
      .replace(/^[+-]\s*/, '')
      .replace(/^(ARS|USD|EUR|U\$S|US\$)\$?\s*/i, '')
      .replace(/^\$\s*/, '')
      .replace(/\s+/g, '');
    const parsed = parseGroupedNumber(numeric, hint === 'unknown' ? 'US' : hint);
    const direction: 'expense' | 'income' = signed ? 'income' : 'expense';
    if (parsed?.excessDecimals) {
      return { amount: null, ambiguous: true, direction, excessDecimals: true };
    }
    if (!parsed || !(parsed.value > 0) || parsed.value > MAX_AMOUNT) {
      return { amount: null, ambiguous: false, direction: 'expense' };
    }
    return {
      amount: parsed.value,
      ambiguous: parsed.ambiguous,
      direction,
    };
  }
  return { amount: null, ambiguous: false, direction: 'expense' };
}

const WALLET_PAST_MS = 366 * 86400000;
const WALLET_FUTURE_MS = 86400000;

/** Parse a wallet timestamp without consulting the clock. Date-only stays civil. */
export function parseWalletTimestamp(v: unknown): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [year, month, day] = s.split('-').map(Number);
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const civilNoon = new Date(`${s}T12:00:00-03:00`);
    if (Number.isNaN(civilNoon.getTime())) return null;
    const roundTrip = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Argentina/Cordoba',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(civilNoon);
    if (roundTrip !== s) return null;
    return s;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** Freshness/date-sanity for *new* requests only. Canonicalization must not call this. */
export function isWalletTimestampFresh(iso: string | null | undefined, now: number = Date.now()): boolean {
  if (!iso) return true;
  const instant = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T12:00:00-03:00`).getTime()
    : Date.parse(iso);
  if (!Number.isFinite(instant)) return false;
  return instant >= now - WALLET_PAST_MS && instant <= now + WALLET_FUTURE_MS;
}

/**
 * Structured JSON body (Apple Shortcut) plus a regex/heuristic parser for
 * Android notification text. Empty amount/merchant are tolerated.
 */
export function parseWalletPayload(input: {
  json?: Record<string, unknown> | null;
  text?: string | null;
  rawJson?: string | null;
}): WalletIngestPayload {
  const json = input.json && typeof input.json === 'object' ? input.json : null;
  const fullText = typeof input.text === 'string' ? input.text : jsonText(json, false);
  // Identity (merchant/card/fingerprint) uses the same truncated input as main.
  const truncated = fullText ? fullText.slice(0, MAX_TEXT) : null;
  const fromText = parseWalletText(truncated);
  const text = truncated;
  const textVeto = Boolean(fullText && textFailsAutoConfirmGates(fullText));

  const rawCurrency = json ? json.currency ?? json.moneda : undefined;
  const jsonCurrencyText =
    rawCurrency != null && String(rawCurrency).trim() !== '' ? String(rawCurrency).trim().toUpperCase() : '';
  const parsedJsonCurrency = jsonCurrencyText ? parseTransactionCurrency(jsonCurrencyText) : null;
  const jsonUnsupported = Boolean(jsonCurrencyText) && parsedJsonCurrency == null;
  const currencyUnsupported = jsonUnsupported || fromText.currencyUnsupported;
  const jsonAmountRaw = json ? json.amount ?? json.importe ?? json.value ?? json.monto : undefined;
  const extracted = input.rawJson ? extractTopLevelJsonAmount(input.rawJson) : { token: null, duplicate: false };
  const amountToken =
    extracted.token ?? (typeof jsonAmountRaw === 'string' ? jsonAmountRaw : null);
  const jsonAmount =
    extracted.duplicate
      ? { amount: null, ambiguous: true, direction: 'expense' as const }
      : jsonAmountRaw != null
        ? parseAmountValue(jsonAmountRaw, amountToken)
        : null;
  const jsonAmountUsable = jsonAmount != null && jsonAmount.amount != null;
  const jsonExcessDecimals = Boolean(jsonAmount?.excessDecimals);
  const currency = jsonUnsupported
    ? jsonCurrencyText
    : parsedJsonCurrency ?? fromText.currency;
  const wordVeto =
    Boolean(fullText) && (currency === 'ARS' || currency === 'USD' || currency === 'EUR')
      ? currencyWordDisagrees(fullText!, currency)
      : false;
  const amountAmbiguous =
    currencyUnsupported ||
    jsonExcessDecimals ||
    extracted.duplicate ||
    textVeto ||
    wordVeto ||
    (jsonAmountUsable && jsonAmount
      ? jsonAmount.ambiguous
      : jsonAmountRaw != null
        ? true
        : fromText.amountAmbiguous);

  return {
    amount:
      extracted.duplicate || jsonExcessDecimals
        ? null
        : jsonAmountUsable && jsonAmount
          ? jsonAmount.amount
          : fromText.amount,
    currency,
    merchant: (json ? str(json.merchant ?? json.comercio ?? json.name) : null) ?? fromText.merchant,
    cardName: (json ? str(json.cardName ?? json.card ?? json.tarjeta ?? json.account) : null) ?? fromText.cardName,
    occurredAt: (json ? parseWalletTimestamp(json.timestamp ?? json.occurredAt ?? json.date ?? json.fecha) : null) ?? fromText.occurredAt,
    rawText: text,
    amountAmbiguous,
    currencyUnsupported,
    direction: jsonAmountUsable && jsonAmount ? jsonAmount.direction : fromText.direction,
    excessDecimals: jsonExcessDecimals,
    amountDuplicate: extracted.duplicate,
  };
}

export function parseWalletText(text: string | null): Omit<WalletIngestPayload, 'rawText'> {
  if (!text) {
    return {
      amount: null,
      currency: 'ARS',
      merchant: null,
      cardName: null,
      occurredAt: null,
      amountAmbiguous: false,
      currencyUnsupported: false,
      direction: 'expense',
    };
  }
  const unsupported = detectUnsupportedCurrencyInText(text);
  const parsed = parseAmountFromText(text);
  const currency = unsupported ? unsupported : parsed.currency ?? 'ARS';
  const cardName =
    str(text.match(/(?:tarjeta|card|visa|mastercard|amex|naranja|galicia|macro|bbva|santander)\s*[\w*]{0,20}/i)?.[0]) ||
    null;
  const en = text.match(/\ben\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .&'-]{3,60})/i);
  const comercio = text.match(/comercio[:\s]+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .&'-]{3,60})/i);
  const merchant = str(comercio?.[1] || en?.[1]);
  return {
    amount: parsed.amount,
    currency,
    merchant,
    cardName,
    occurredAt: null,
    amountAmbiguous: parsed.ambiguous || Boolean(unsupported),
    currencyUnsupported: Boolean(unsupported),
    direction: parsed.direction,
  };
}
