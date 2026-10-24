import { coerceTransactionCurrency } from '@/lib/constants/transaction-currencies';

export type WalletIngestPayload = {
  amount: number | null;
  currency: string;
  merchant: string | null;
  cardName: string | null;
  occurredAt: string | null;
  rawText: string | null;
};

const MAX_TEXT = 4000;

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

  const fromJson = json
    ? {
        amount: parseAmount(json.amount ?? json.importe ?? json.value),
        currency: coerceTransactionCurrency(String(json.currency ?? json.moneda ?? 'ARS')),
        merchant: str(json.merchant ?? json.comercio ?? json.name),
        cardName: str(json.cardName ?? json.card ?? json.tarjeta ?? json.account),
        occurredAt: parseTimestamp(json.timestamp ?? json.occurredAt ?? json.date ?? json.fecha),
      }
    : null;

  const fromText = parseWalletText(text);

  return {
    amount: fromJson?.amount ?? fromText.amount,
    currency: fromJson?.currency ?? fromText.currency,
    merchant: fromJson?.merchant ?? fromText.merchant,
    cardName: fromJson?.cardName ?? fromText.cardName,
    occurredAt: fromJson?.occurredAt ?? fromText.occurredAt,
    rawText: text,
  };
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

function parseAmount(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v * 100) / 100;
  if (typeof v === 'string') return parseAmountFromText(v);
  return null;
}

function parseTimestamp(v: unknown): string | null {
  if (v == null || v === '') return null;
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return null;
  const t = d.getTime();
  if (t < Date.now() - 366 * 86400000 || t > Date.now() + 86400000) return null;
  return d.toISOString();
}

const AMOUNT_RE =
  /(?:ARS|USD|EUR|\$|U\$S|US\$)?\s*(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)/i;

export function parseAmountFromText(text: string): number | null {
  const m = text.replace(/\u00a0/g, ' ').match(AMOUNT_RE);
  if (!m) return null;
  const raw = m[1].replace(/\s/g, '');
  const normalized = raw.includes(',') && raw.includes('.')
    ? raw.replace(/\./g, '').replace(',', '.')
    : raw.includes(',')
      ? raw.replace(',', '.')
      : raw;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function parseWalletText(text: string | null): Omit<WalletIngestPayload, 'rawText'> {
  if (!text) {
    return { amount: null, currency: 'ARS', merchant: null, cardName: null, occurredAt: null };
  }
  const currency = /\bUSD\b|U\$S|US\$/i.test(text) ? 'USD' : /\bEUR\b/i.test(text) ? 'EUR' : 'ARS';
  const amount = parseAmountFromText(text);
  const cardName =
    str(text.match(/(?:tarjeta|card|visa|mastercard|amex|naranja|galicia|macro|bbva|santander)\s*[\w*]{0,20}/i)?.[0]) ||
    null;
  let merchant: string | null = null;
  const en = text.match(/\ben\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .&'-]{3,60})/i);
  const comercio = text.match(/comercio[:\s]+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9 .&'-]{3,60})/i);
  merchant = str(comercio?.[1] || en?.[1]);
  return { amount, currency, merchant, cardName, occurredAt: null };
}
