/**
 * Live-main Wallet free-text amount/currency extraction, copied from
 * `lib/integrations/wallet-parse.ts` at fb63360d404e27c33f5e66c65c557bf23525f349
 * (origin/main). Used only as an auto-confirm guard so HEAD cannot write a
 * rawText expense that production would not extract with the same cents,
 * currency, and direction.
 */
import {
  integerCentsFromToken,
  moneyAmountFromToken,
} from '@/lib/money-amount';

const CREDIT_CARD_PHRASE = /tarjeta\s+de\s+cr[eé]dito|credit\s+card/gi;

/** ISO codes and symbols that are not ARS/USD/EUR. Word tokens only — never silent ARS. */
const UNSUPPORTED_ISO =
  /\b(GBP|JPY|BRL|CLP|UYU|MXN|CAD|CHF|CNY|AUD|NZD|KRW|PEN|COP|BOB|PYG|CRC|GTQ|HNL|NIO|PAB|DOP|INR|ZAR|SEK|NOK|DKK|PLN|CZK|HUF|TRY|RUB|SGD|HKD|TWD|THB|IDR|MYR|PHP|VND|ILS|AED|SAR|EGP|NGN)\b/i;

function detectUnsupportedCurrencyInText(text: string): string | null {
  const iso = text.match(UNSUPPORTED_ISO);
  if (iso) return iso[1].toUpperCase();
  if (/[£₤]|GB£/.test(text)) return 'GBP';
  if (/¥/.test(text)) return 'JPY';
  return null;
}

const MAX_AMOUNT = 1_000_000_000;
const LAST4_CONTEXT =
  /(?:terminad[ao]s?\s+en|ending\s+in|últimos?\s*(?:4|cuatro)|last\s*(?:4|four)|n[úu]mero\s+\*+|tarjeta\s+(?:terminad[ao]a?\s+en)?)\s*[\d*]{2,6}/gi;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
  const s = raw.replace(/\s/g, '');
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

const CANDIDATE_RE =
  /(?<![A-Za-z\d])([+-])?\s*(?:(ARS|USD|EUR|U\$S|US\$)\$?|(\$))?\s*(\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+[.,]\d{1,2}|\d{1,12})/gi;

function parseAmountFromText(text: string): {
  amount: number | null;
  ambiguous: boolean;
  direction: 'expense' | 'income';
  excessDecimals?: boolean;
} {
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
  const extraAnchored = ranked.filter((c) => c.anchored && c.raw !== preferred.raw).length > 0;
  const direction: 'expense' | 'income' = preferred.signed || refund ? 'income' : 'expense';
  if (parsed?.excessDecimals) {
    return { amount: null, ambiguous: true, direction, excessDecimals: true };
  }
  if (!parsed || !(parsed.value > 0) || parsed.value > MAX_AMOUNT) {
    return { amount: null, ambiguous: true, direction };
  }

  return {
    amount: parsed.value,
    ambiguous: parsed.ambiguous || extraAnchored,
    direction,
  };
}

export type LegacyWalletAmount = {
  amount: number | null;
  currency: string;
  direction: 'expense' | 'income';
  ambiguous: boolean;
  currencyUnsupported: boolean;
};

/** fb63360 `parseWalletText` amount + currency + direction, without merchant/card. */
export function legacyWalletAmount(rawText: string): LegacyWalletAmount {
  const unsupported = detectUnsupportedCurrencyInText(rawText);
  const currency = unsupported
    ? unsupported
    : /\bUSD\b|U\$S|US\$/i.test(rawText)
      ? 'USD'
      : /\bEUR\b/i.test(rawText)
        ? 'EUR'
        : 'ARS';
  const parsed = parseAmountFromText(rawText);
  return {
    amount: parsed.amount,
    currency,
    direction: parsed.direction,
    ambiguous: parsed.ambiguous || Boolean(unsupported),
    currencyUnsupported: Boolean(unsupported),
  };
}
