import { parseCSVFile } from '@/lib/import/csv';
import { parseImportDate } from '@/lib/import/date';
import { coerceTransactionCurrency, parseTransactionCurrency } from '@/lib/constants/transaction-currencies';
import { moneyAmountFromToken, numberToDecimalString } from '@/lib/money-amount';

export const MAX_EXTRACTED_MOVEMENTS = 80;
export const MAX_STATEMENT_BYTES = 4 * 1024 * 1024;
export const MAX_TELEGRAM_STATEMENT_BYTES = 8 * 1024 * 1024;
export const MAX_EMAIL_JSON_BYTES = 256 * 1024;
export const MAX_EMAIL_ATTACHMENT_BYTES = 4 * 1024 * 1024;

export type ExtractedMovement = {
  amount: number;
  currency: string;
  type: 'expense' | 'income';
  merchant: string;
  description: string;
  date: string | null;
  installments: number;
  installmentNumber: number | null;
};

export type ExtractedStatement = {
  movements: ExtractedMovement[];
  parser: 'csv' | 'gemini' | 'wallet-text';
  cardLast4: string | null;
};

const DATE_HEADERS = /fecha|date|f\.\s*valor|valor|operaci[oó]n|posted/i;
const DESC_HEADERS = /descrip|detalle|concepto|comercio|merchant|glosa|observ/i;
const AMOUNT_HEADERS = /importe|monto|amount|d[eé]bito|cargo|valor/i;
const CREDIT_HEADERS = /cr[eé]dito|haber|ingreso|deposit/i;
const CURRENCY_HEADERS = /moneda|currency|divisa/i;
const INSTALLMENT_RE = /\b(\d{1,2})\s*\/\s*(\d{1,2})\b/;

function normalizeHeader(h: string): string {
  return h.replace(/"/g, '').trim().toLowerCase();
}

function findCol(headers: string[], re: RegExp): number {
  return headers.findIndex((h) => re.test(normalizeHeader(h)));
}

function parseAmountCell(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-') return null;
  const wrapped = /^\(.*\)$/.test(trimmed);
  const token = (wrapped ? `-${trimmed.slice(1, -1)}` : trimmed).replace(/\s/g, '');
  return moneyAmountFromToken(token);
}

function parseInstallments(text: string): { total: number; number: number | null } {
  const m = text.match(INSTALLMENT_RE);
  if (!m) return { total: 1, number: null };
  const number = Number(m[1]);
  const total = Number(m[2]);
  if (total < 2 || total > 36 || number < 1 || number > total) return { total: 1, number: null };
  return { total, number };
}

function toYmd(value: string): string | null {
  const d = parseImportDate(value, { ambiguousOrder: 'dmy' });
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function pushMovement(
  out: ExtractedMovement[],
  input: {
    amountRaw: string;
    creditRaw?: string;
    desc: string;
    dateRaw: string;
    currencyRaw?: string;
    signedColumn: boolean;
  }
): void {
  if (out.length >= MAX_EXTRACTED_MOVEMENTS) return;
  let amount = parseAmountCell(input.amountRaw);
  let type: 'expense' | 'income' = 'expense';
  if (amount == null && input.creditRaw) {
    const credit = parseAmountCell(input.creditRaw);
    if (credit != null && credit !== 0) {
      amount = Math.abs(credit);
      type = 'income';
    }
  }
  if (amount == null || amount === 0) return;
  if (amount < 0) {
    type = 'expense';
    amount = Math.abs(amount);
  } else if (input.signedColumn && !input.creditRaw) {
    type = 'income';
  }
  const desc = input.desc.replace(/\s+/g, ' ').trim().slice(0, 160) || 'movimiento';
  const inst = parseInstallments(desc);
  const currency = parseTransactionCurrency(input.currencyRaw) ?? coerceTransactionCurrency('ARS');
  out.push({
    amount: Number(numberToDecimalString(amount)),
    currency,
    type,
    merchant: desc,
    description: desc,
    date: toYmd(input.dateRaw),
    installments: inst.total,
    installmentNumber: inst.number,
  });
}

/** Bank/card CSV with recognizable headers. Returns null if it does not look like a statement. */
export function parseStatementCsv(text: string): ExtractedStatement | null {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return null;
  let parsed: { headers: string[]; rows: string[][] };
  try {
    parsed = parseCSVFile(trimmed);
  } catch {
    return null;
  }
  if (parsed.headers.length < 2 || parsed.rows.length === 0) return null;
  const dateIdx = findCol(parsed.headers, DATE_HEADERS);
  const descIdx = findCol(parsed.headers, DESC_HEADERS);
  const amountIdx = findCol(parsed.headers, AMOUNT_HEADERS);
  if (dateIdx < 0 || amountIdx < 0) return null;
  const creditIdx = findCol(parsed.headers, CREDIT_HEADERS);
  const currencyIdx = findCol(parsed.headers, CURRENCY_HEADERS);
  const signedColumn =
    creditIdx < 0 &&
    parsed.rows.some((row) => {
      const n = parseAmountCell(row[amountIdx] ?? '');
      return n != null && n < 0;
    });
  const movements: ExtractedMovement[] = [];
  for (const row of parsed.rows) {
    pushMovement(movements, {
      amountRaw: row[amountIdx] ?? '',
      creditRaw: creditIdx >= 0 ? row[creditIdx] : undefined,
      desc: descIdx >= 0 ? row[descIdx] ?? '' : '',
      dateRaw: row[dateIdx] ?? '',
      currencyRaw: currencyIdx >= 0 ? row[currencyIdx] : undefined,
      signedColumn,
    });
  }
  if (movements.length === 0) return null;
  return { movements, parser: 'csv', cardLast4: null };
}

export function parseGeminiExtractJson(raw: string): ExtractedStatement {
  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('El modelo no devolvió JSON válido.');
  }
  const root = parsed as { movements?: unknown; cardLast4?: unknown };
  if (!Array.isArray(root.movements)) {
    throw new Error('El modelo no devolvió movimientos.');
  }
  const movements: ExtractedMovement[] = [];
  for (const item of root.movements.slice(0, MAX_EXTRACTED_MOVEMENTS)) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const desc = String(row.merchant || row.description || 'movimiento')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160);
    const instRaw = Number(row.installments);
    const installments = Number.isInteger(instRaw) && instRaw >= 2 && instRaw <= 36 ? instRaw : 1;
    const numRaw = Number(row.installmentNumber);
    const type = row.type === 'income' || amount < 0 ? 'income' : 'expense';
    const date = typeof row.date === 'string' ? toYmd(row.date) : null;
    movements.push({
      amount: Math.abs(Number(numberToDecimalString(amount))),
      currency: parseTransactionCurrency(String(row.currency || 'ARS')) ?? 'ARS',
      type,
      merchant: desc || 'movimiento',
      description: desc || 'movimiento',
      date,
      installments,
      installmentNumber: Number.isInteger(numRaw) && numRaw >= 1 ? numRaw : null,
    });
  }
  const last4 = typeof root.cardLast4 === 'string' && /^\d{4}$/.test(root.cardLast4) ? root.cardLast4 : null;
  return { movements, parser: 'gemini', cardLast4: last4 };
}

export function looksLikePdf(bytes: Uint8Array, mime?: string | null, filename?: string | null): boolean {
  if (mime?.toLowerCase().includes('pdf')) return true;
  if (filename?.toLowerCase().endsWith('.pdf')) return true;
  return bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

export function looksLikeCsv(mime?: string | null, filename?: string | null, text?: string): boolean {
  if (mime?.toLowerCase().includes('csv') || mime?.toLowerCase().includes('text/plain')) return true;
  if (filename && /\.(csv|txt)$/i.test(filename)) return true;
  if (!text) return false;
  const first = text.split(/\r?\n/, 1)[0] || '';
  return /fecha|date|importe|monto|descrip/i.test(first) && /[,;]/.test(first);
}

