import { parseTransactionCurrency } from '@/lib/constants/transaction-currencies';

const CREDIT_CARD_PHRASE = /tarjeta\s+de\s+cr[eé]dito|credit\s+card/gi;

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
};

export type AmountParseResult = {
  amount: number | null;
  ambiguous: boolean;
  direction: 'expense' | 'income';
};

const MAX_TEXT = 4000;
const MAX_AMOUNT = 1_000_000_000;
const LAST4_CONTEXT =
  /(?:terminad[ao]s?\s+en|ending\s+in|últimos?\s*(?:4|cuatro)|last\s*(?:4|four)|n[úu]mero\s+\*+|tarjeta\s+(?:terminad[ao]a?\s+en)?)\s*[\d*]{2,6}/gi;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function jsonText(json: Record<string, unknown> | null): string | null {
  if (!json) return null;
  const raw = json.rawText ?? json.text ?? json.body ?? json.notification;
  return typeof raw === 'string' ? raw.slice(0, MAX_TEXT) : null;
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

function parseGroupedNumber(raw: string, localeHint: 'AR' | 'US' | 'unknown'): { value: number; ambiguous: boolean } | null {
  const s = raw.replace(/\s/g, '');
  if (!s) return null;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      const n = Number(s.replace(/\./g, '').replace(',', '.'));
      return Number.isFinite(n) ? { value: round2(n), ambiguous: false } : null;
    }
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) ? { value: round2(n), ambiguous: false } : null;
  }

  if (hasComma && !hasDot) {
    const parts = s.split(',');
    const frac = parts[parts.length - 1] ?? '';
    if (parts.length === 2 && frac.length <= 2) {
      const n = Number(s.replace(',', '.'));
      return Number.isFinite(n) ? { value: round2(n), ambiguous: false } : null;
    }
    if (frac.length === 3 && parts.every((p, i) => i === 0 || p.length === 3)) {
      const n = Number(s.replace(/,/g, ''));
      return Number.isFinite(n) ? { value: round2(n), ambiguous: false } : null;
    }
    return null;
  }

  if (hasDot && !hasComma) {
    const parts = s.split('.');
    const frac = parts[parts.length - 1] ?? '';
    if (parts.length > 2) {
      if (parts.slice(1).every((p) => p.length === 3)) {
        const n = Number(s.replace(/\./g, ''));
        return Number.isFinite(n) ? { value: round2(n), ambiguous: false } : null;
      }
      return null;
    }
    if (frac.length === 3) {
      if (localeHint === 'US') {
        const asDecimal = Number(s);
        return Number.isFinite(asDecimal) ? { value: round2(asDecimal), ambiguous: true } : null;
      }
      const n = Number(s.replace(/\./g, ''));
      if (!Number.isFinite(n)) return null;
      return { value: round2(n), ambiguous: localeHint === 'unknown' };
    }
    if (frac.length <= 2) {
      const n = Number(s);
      return Number.isFinite(n) ? { value: round2(n), ambiguous: false } : null;
    }
    return null;
  }

  const n = Number(s);
  return Number.isFinite(n) ? { value: round2(n), ambiguous: false } : null;
}

const CANDIDATE_RE =
  /(?<![A-Za-z\d])([+-])?\s*(?:(ARS|USD|EUR|U\$S|US\$)\$?|(\$))?\s*(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+[.,]\d{1,2}|\d{1,12})/gi;

export function parseAmountFromText(text: string): AmountParseResult {
  const src = text.replace(/\u00a0/g, ' ');
  const refundSrc = src.replace(CREDIT_CARD_PHRASE, ' ');
  const refund = /\b(devoluci[oó]n|refund|reintegro|contracargo|revers[ao]|cr[eé]dito)\b/i.test(refundSrc);
  const stripped = src.replace(LAST4_CONTEXT, ' ');
  const hint = localeHintFromText(src);

  const matches: Array<{ raw: string; signed: boolean; anchored: boolean; digits: string }> = [];
  CANDIDATE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CANDIDATE_RE.exec(stripped))) {
    const digits = (m[4] || '').replace(/\s/g, '');
    const anchored = Boolean(m[2] || m[3]);
    matches.push({
      raw: digits,
      signed: m[1] === '-',
      anchored,
      digits: digits.replace(/\D/g, ''),
    });
  }

  const ranked = matches.filter((c) => {
    if (!c.raw) return false;
    if (!c.anchored && c.digits.length === 4 && !c.raw.includes('.') && !c.raw.includes(',')) {
      return false;
    }
    return true;
  });

  const preferred = ranked.find((c) => c.anchored) ?? ranked[0];
  if (!preferred) {
    return { amount: null, ambiguous: false, direction: refund ? 'income' : 'expense' };
  }

  const parsed = parseGroupedNumber(preferred.raw, hint);
  if (!parsed || !(parsed.value > 0) || parsed.value > MAX_AMOUNT) {
    return { amount: null, ambiguous: true, direction: refund ? 'income' : 'expense' };
  }

  const extraAnchored = ranked.filter((c) => c.anchored && c.raw !== preferred.raw).length > 0;
  const direction: 'expense' | 'income' = preferred.signed || refund ? 'income' : 'expense';
  return {
    amount: parsed.value,
    ambiguous: parsed.ambiguous || extraAnchored,
    direction,
  };
}

function parseAmountValue(v: unknown): AmountParseResult {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const abs = Math.abs(v);
    if (!(abs > 0) || abs > MAX_AMOUNT) return { amount: null, ambiguous: false, direction: 'expense' };
    return { amount: round2(abs), ambiguous: false, direction: v < 0 ? 'income' : 'expense' };
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
    if (!parsed || !(parsed.value > 0) || parsed.value > MAX_AMOUNT) {
      return { amount: null, ambiguous: false, direction: 'expense' };
    }
    return {
      amount: parsed.value,
      ambiguous: parsed.ambiguous,
      direction: signed ? 'income' : 'expense',
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
}): WalletIngestPayload {
  const json = input.json && typeof input.json === 'object' ? input.json : null;
  const text = typeof input.text === 'string' ? input.text.slice(0, MAX_TEXT) : jsonText(json);
  const fromText = parseWalletText(text);

  const rawCurrency = json ? json.currency ?? json.moneda : undefined;
  const jsonCurrencyText =
    rawCurrency != null && String(rawCurrency).trim() !== '' ? String(rawCurrency).trim().toUpperCase() : '';
  const parsedJsonCurrency = jsonCurrencyText ? parseTransactionCurrency(jsonCurrencyText) : null;
  const jsonUnsupported = Boolean(jsonCurrencyText) && parsedJsonCurrency == null;
  const currencyUnsupported = jsonUnsupported || fromText.currencyUnsupported;
  const jsonAmountRaw = json ? json.amount ?? json.importe ?? json.value : undefined;
  const jsonAmount = jsonAmountRaw != null ? parseAmountValue(jsonAmountRaw) : null;
  const jsonAmountUsable = jsonAmount != null && jsonAmount.amount != null;
  // If a JSON amount was present but unusable we fell back to rawText — recompute
  // ambiguity from that text and treat the fallback as ambiguous so auto-confirm
  // cannot fire on a guessed number.
  const amountAmbiguous =
    currencyUnsupported ||
    (jsonAmountUsable && jsonAmount
      ? jsonAmount.ambiguous
      : jsonAmountRaw != null
        ? true
        : fromText.amountAmbiguous);

  return {
    amount: jsonAmountUsable && jsonAmount ? jsonAmount.amount : fromText.amount,
    currency: jsonUnsupported
      ? jsonCurrencyText
      : parsedJsonCurrency ?? fromText.currency,
    merchant: (json ? str(json.merchant ?? json.comercio ?? json.name) : null) ?? fromText.merchant,
    cardName: (json ? str(json.cardName ?? json.card ?? json.tarjeta ?? json.account) : null) ?? fromText.cardName,
    occurredAt: (json ? parseWalletTimestamp(json.timestamp ?? json.occurredAt ?? json.date ?? json.fecha) : null) ?? fromText.occurredAt,
    rawText: text,
    amountAmbiguous,
    currencyUnsupported,
    direction: jsonAmountUsable && jsonAmount ? jsonAmount.direction : fromText.direction,
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
  const currency = unsupported
    ? unsupported
    : /\bUSD\b|U\$S|US\$/i.test(text)
      ? 'USD'
      : /\bEUR\b/i.test(text)
        ? 'EUR'
        : 'ARS';
  const parsed = parseAmountFromText(text);
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
