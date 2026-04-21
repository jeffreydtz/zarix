import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/server';
import { createServiceClientSync } from '@/lib/supabase/server';
import { transactionsService } from '@/lib/services/transactions';
import type { ImportSkippedDetail } from '@/types/import';

const MAX_SKIPPED_DETAILS = 250;
/** Límite de tamaño de archivo de import (mitiga DoS y reduce superficie de bugs en parsers). */
const MAX_IMPORT_FILE_BYTES = 12 * 1024 * 1024;

interface ImportedTransaction {
  date: string;
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  currency: string;
  account: string;
  category?: string;
  description?: string;
  notes?: string;
  /** Si el monto en moneda de transacción (ej. USD) difiere del de cuenta (ej. ARS), va el equivalente en moneda de cuenta */
  amountInAccountCurrency?: number;
}

interface ImportedTransferRow {
  date: string;
  outgoingName: string;
  incomingName: string;
  amountOutgoing: number;
  currencyOutgoing: string;
  amountIncoming?: number;
  currencyIncoming?: string;
  comment?: string;
}

type UnresolvedAction = 'none' | 'map' | 'keep_name';

interface UnresolvedResolution {
  action: UnresolvedAction;
  accountId?: string;
}

function detectDelimiter(headerLine: string): ',' | ';' {
  let commas = 0;
  let semis = 0;
  let q = false;
  for (const char of headerLine) {
    if (char === '"') q = !q;
    else if (!q) {
      if (char === ',') commas++;
      if (char === ';') semis++;
    }
  }
  return semis > commas ? ';' : ',';
}

function parseCSVLine(line: string, delimiter: ',' | ';'): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

function parseCSVFile(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCSVLine(lines[0], delimiter);
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    rows.push(parseCSVLine(lines[i], delimiter));
  }
  return { headers, rows };
}

function normalizeHeader(h: string): string {
  return h.replace(/"/g, '').trim().toLowerCase();
}

/**
 * Clave estable para emparejar nombres en import (cuentas/categorías):
 * minúsculas, espacios colapsados e insensible a tildes y otros diacríticos
 * (ej. "Categoría" = "Categoria" = "CATEGORÍA").
 */
function normalizeImportMatchKey(s: string): string {
  return s
    .trim()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** Primera entrada gana si dos nombres colisionan tras normalizar (caso raro). */
function buildImportLookupMap<T extends { name: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = normalizeImportMatchKey(item.name);
    if (!map.has(key)) {
      map.set(key, item);
    }
  }
  return map;
}

/** Códigos ISO típicos ARS, USD, EUR (3 letras) */
function normalizeCurrencyCode(raw: string): string | null {
  const t = raw.replace(/[^A-Za-z]/g, '').toUpperCase();
  if (t.length === 3) return t;
  if (t.length > 3) return t.slice(0, 3);
  return null;
}

function findColumnIndex(headers: string[], matchers: RegExp[]): number {
  const normalized = headers.map(normalizeHeader);
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i];
    if (matchers.some((re) => re.test(h))) return i;
  }
  return -1;
}

/** Fecha solo-calendario (sin hora) → mediodía UTC; evita correr un día al mostrar en UTC−3 u otras zonas. */
function calendarDateToUtcNoon(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** Cuando día y mes son ambiguos (≤12), elegir orden (Argentina vs EE.UU.). */
type ImportDateAmbiguousOrder = 'dmy' | 'mdy';

interface ParseImportDateOpts {
  ambiguousOrder?: ImportDateAmbiguousOrder;
}

/**
 * Número serial de Excel (días; 1 ≈ 1900-01-01) → fecha calendario en UTC mediodía.
 * Evita que una celda numérica se interprete como milisegundos en `new Date(n)`.
 */
function excelSerialToUtcCalendarDate(serial: number): Date | null {
  const whole = Math.floor(serial);
  if (whole < 1 || whole > 1000000) return null;
  const ms = (whole - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return calendarDateToUtcNoon(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function parseImportDate(
  dateStr: string | number | undefined | null,
  opts?: ParseImportDateOpts
): Date | null {
  const ambiguousOrder = opts?.ambiguousOrder ?? 'dmy';

  if (typeof dateStr === 'number' && Number.isFinite(dateStr)) {
    const n = dateStr;
    if (n > 20000 && n < 80000) {
      const fromExcel = excelSerialToUtcCalendarDate(n);
      if (fromExcel) return fromExcel;
    }
    return null;
  }

  const raw = String(dateStr ?? '').trim();
  if (!raw) return null;

  // Serial Excel como texto (p. ej. "45321")
  if (/^\d{5,6}$/.test(raw)) {
    const n = Number(raw);
    if (n > 20000 && n < 80000) {
      const fromExcel = excelSerialToUtcCalendarDate(n);
      if (fromExcel) return fromExcel;
    }
  }

  // YYYY-MM-DD sin hora (común en Excel export y CSV)
  const isoDateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDateOnly) {
    const y = Number(isoDateOnly[1]);
    const m = Number(isoDateOnly[2]);
    const d = Number(isoDateOnly[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return calendarDateToUtcNoon(y, m, d);
    }
  }

  // ISO con hora (T o espacio) — respetar el instante (JSON export, Airtable, etc.)
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d/.test(raw)) {
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const datePart = raw.split(/\s+/)[0] ?? raw;

  // DD/MM/YYYY o MM/DD/YYYY (export es-AR suele ser 15/1/2024; EE.UU. suele ser 2/4/2025 = 4 feb)
  const slashMatch = datePart.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (slashMatch) {
    const A = Number(slashMatch[1]);
    const B = Number(slashMatch[2]);
    const yearRaw = Number(slashMatch[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;

    let month: number;
    let day: number;
    if (A > 12) {
      day = A;
      month = B;
    } else if (B > 12) {
      month = A;
      day = B;
    } else {
      // Ambiguo (ej. 02/04/2025): DD/MM → 2 abr; MM/DD (EE.UU.) → 4 feb
      if (ambiguousOrder === 'mdy') {
        month = A;
        day = B;
      } else {
        day = A;
        month = B;
      }
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return calendarDateToUtcNoon(year, month, day);
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) return fallback;

  return null;
}

function parseImportAmount(amountValue: unknown): number | null {
  if (typeof amountValue === 'number' && Number.isFinite(amountValue)) {
    return Math.abs(amountValue);
  }

  const raw = String(amountValue ?? '').trim();
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d.,\-]/g, '');
  if (!cleaned) return null;

  const dotDecimalPattern = /^-?\d+(?:\.\d+)?$/;
  if (dotDecimalPattern.test(cleaned)) {
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) return null;
    return Math.abs(parsed);
  }

  const commaAsDecimal = /^-?\d{1,3}(?:\.\d{3})*,\d+$/;
  if (commaAsDecimal.test(cleaned)) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return Math.abs(parsed);
  }

  const simpleCommaDecimal = /^-?\d+,\d+$/;
  if (simpleCommaDecimal.test(cleaned)) {
    const parsed = Number(cleaned.replace(',', '.'));
    if (Number.isFinite(parsed)) return Math.abs(parsed);
  }

  return null;
}

function parseStandardCSV(
  headers: string[],
  rows: string[][],
  parseOpts: ParseImportDateOpts
): ImportedTransaction[] {
  const h = headers.map(normalizeHeader);

  const dateIdx = h.findIndex((x) => ['fecha', 'date'].includes(x));
  const typeIdx = h.findIndex((x) => ['tipo', 'type'].includes(x));
  const amountIdx = h.findIndex((x) => ['monto', 'amount'].includes(x));
  const currencyIdx = h.findIndex((x) => ['moneda', 'currency'].includes(x));
  const accountIdx = h.findIndex((x) => ['cuenta', 'account'].includes(x));
  const categoryIdx = h.findIndex((x) =>
    ['categoría', 'categoria', 'category'].includes(x)
  );
  const descriptionIdx = h.findIndex((x) =>
    ['descripción', 'descripcion', 'description'].includes(x)
  );
  const notesIdx = h.findIndex((x) => ['notas', 'notes'].includes(x));

  if (dateIdx === -1 || amountIdx === -1) {
    throw new Error('CSV debe tener columnas "Fecha" y "Monto"');
  }

  const transactions: ImportedTransaction[] = [];
  const getValue = (row: string[], idx: number) =>
    idx >= 0 && idx < row.length ? row[idx] : '';

  for (const row of rows) {
    const rawType = getValue(row, typeIdx).toLowerCase();
    let type: 'expense' | 'income' | 'transfer' = 'expense';
    if (['ingreso', 'income'].includes(rawType)) type = 'income';
    else if (['transferencia', 'transfer'].includes(rawType)) type = 'transfer';

    const amount = parseImportAmount(getValue(row, amountIdx));
    if (amount === null || amount === 0) continue;

    const parsedDate = parseImportDate(getValue(row, dateIdx), parseOpts);
    if (!parsedDate) continue;

    transactions.push({
      date: parsedDate.toISOString(),
      type,
      amount,
      currency: getValue(row, currencyIdx) || 'ARS',
      account: getValue(row, accountIdx) || '',
      category: getValue(row, categoryIdx) || undefined,
      description: getValue(row, descriptionIdx) || undefined,
      notes: getValue(row, notesIdx) || undefined,
    });
  }

  return transactions;
}

function tryParseTransferCSV(
  headers: string[],
  rows: string[][],
  parseOpts: ParseImportDateOpts
): ImportedTransferRow[] | null {
  const dateIdx = findColumnIndex(headers, [
    /^fecha y hora$/,
    /^fecha_hora$/,
    /^date and time$/,
    /^datetime$/,
    /^fecha$/,
    /^fecha.*hora$/,
    /^date.*time$/,
  ]);

  const outgoingIdx = findColumnIndex(headers, [
    /^outgoing$/,
    /^origen$/,
    /^saliente$/,
    /^cuenta origen$/,
    /^cuenta_origen$/,
    /^cuenta saliente$/,
  ]);

  const incomingIdx = findColumnIndex(headers, [
    /^incoming$/,
    /^destino$/,
    /^entrante$/,
    /^cuenta destino$/,
    /^cuenta_destino$/,
    /^cuenta entrante$/,
  ]);

  const amountOutIdx = findColumnIndex(headers, [
    /^amount in outgoing currency$/,
    /^monto en moneda origen$/,
    /^monto moneda origen$/,
    /^monto en moneda de origen$/,
    /^monto moneda saliente$/,
  ]);

  const currencyOutIdx = findColumnIndex(headers, [
    /^outgoing currency$/,
    /^moneda origen$/,
    /^moneda saliente$/,
  ]);

  const amountInIdx = findColumnIndex(headers, [
    /^amount in incoming currency$/,
    /^monto en moneda destino$/,
    /^monto moneda destino$/,
    /^monto en moneda de destino$/,
    /^monto moneda entrante$/,
  ]);

  const currencyInIdx = findColumnIndex(headers, [
    /^incoming currency$/,
    /^moneda destino$/,
    /^moneda entrada$/,
  ]);

  const commentIdx = findColumnIndex(headers, [/^comment$/, /^comentario$/]);

  if (
    dateIdx < 0 ||
    outgoingIdx < 0 ||
    incomingIdx < 0 ||
    amountOutIdx < 0 ||
    currencyOutIdx < 0 ||
    outgoingIdx === incomingIdx
  ) {
    return null;
  }

  const out: ImportedTransferRow[] = [];
  const getValue = (row: string[], idx: number) =>
    idx >= 0 && idx < row.length ? row[idx] : '';

  for (const row of rows) {
    const outgoingName = getValue(row, outgoingIdx).trim();
    const incomingName = getValue(row, incomingIdx).trim();
    const amountOutgoing = parseImportAmount(getValue(row, amountOutIdx));
    const currencyOutgoing = getValue(row, currencyOutIdx).trim() || 'ARS';

    if (!outgoingName || !incomingName || amountOutgoing === null || amountOutgoing === 0) {
      continue;
    }

    const parsedDate = parseImportDate(getValue(row, dateIdx), parseOpts);
    if (!parsedDate) continue;

    let amountIncoming: number | undefined;
    if (amountInIdx >= 0) {
      const v = parseImportAmount(getValue(row, amountInIdx));
      if (v !== null && v > 0) amountIncoming = v;
    }

    let currencyIncoming: string | undefined;
    if (currencyInIdx >= 0) {
      const c = getValue(row, currencyInIdx).trim();
      if (c) currencyIncoming = c;
    }

    const comment = commentIdx >= 0 ? getValue(row, commentIdx).trim() : undefined;

    out.push({
      date: parsedDate.toISOString(),
      outgoingName,
      incomingName,
      amountOutgoing,
      currencyOutgoing,
      amountIncoming,
      currencyIncoming,
      comment: comment || undefined,
    });
  }

  return out;
}

function parseUnifiedFromGrid(
  headers: string[],
  rows: string[][],
  parseOpts: ParseImportDateOpts
):
  | { kind: 'standard'; transactions: ImportedTransaction[] }
  | { kind: 'transfer'; transfers: ImportedTransferRow[] } {
  if (headers.length === 0) {
    return { kind: 'standard', transactions: [] };
  }

  const transferRows = tryParseTransferCSV(headers, rows, parseOpts);
  if (transferRows !== null) {
    return { kind: 'transfer', transfers: transferRows };
  }

  return { kind: 'standard', transactions: parseStandardCSV(headers, rows, parseOpts) };
}

/** Formato Airtable / export multi-hoja: Date and time, Category, Account, Amount in account currency, Account currency, Comment… */
function inferTxTypeFromSheetName(sheetName: string): 'expense' | 'income' | null {
  const n = sheetName.toLowerCase();
  if (n.includes('expense')) return 'expense';
  if (n.includes('income')) return 'income';
  return null;
}

function tryParseAirtableExpenseIncome(
  headers: string[],
  rows: string[][],
  sheetName: string,
  parseOpts: ParseImportDateOpts
): ImportedTransaction[] | null {
  const amountInAcctIdx = findColumnIndex(headers, [/^amount in account currency$/i]);
  const currencyAcctIdx = findColumnIndex(headers, [/^account currency$/i]);
  const accountIdx = findColumnIndex(headers, [/^account$/i]);
  const dateIdx = findColumnIndex(headers, [
    /^date and time$/i,
    /^fecha y hora$/i,
    /^fecha$/i,
  ]);
  const txAmtIdx = findColumnIndex(headers, [
    /^transaction amount in transaction currency$/i,
    /^monto en moneda de transacción$/i,
    /^monto transacción$/i,
  ]);
  const txCurIdx = findColumnIndex(headers, [
    /^transaction currency$/i,
    /^moneda de transacción$/i,
  ]);

  if (amountInAcctIdx < 0 || currencyAcctIdx < 0 || accountIdx < 0 || dateIdx < 0) {
    return null;
  }

  const categoryIdx = findColumnIndex(headers, [/^category$/i, /^categoría$/i]);
  const commentIdx = findColumnIndex(headers, [/^comment$/i, /^comentario$/i]);
  const tagsIdx = findColumnIndex(headers, [/^tags$/i]);

  const txType = inferTxTypeFromSheetName(sheetName) ?? 'expense';

  const out: ImportedTransaction[] = [];
  const getValue = (row: string[], idx: number) =>
    idx >= 0 && idx < row.length ? row[idx] : '';

  for (const row of rows) {
    const parsedDate = parseImportDate(getValue(row, dateIdx), parseOpts);
    if (!parsedDate) continue;

    const acctAmt = parseImportAmount(getValue(row, amountInAcctIdx));
    const acctCurRaw = getValue(row, currencyAcctIdx).trim();
    const acctCode = normalizeCurrencyCode(acctCurRaw);
    const acctCurNorm = acctCode || acctCurRaw.toUpperCase() || 'ARS';

    const txAmt = txAmtIdx >= 0 ? parseImportAmount(getValue(row, txAmtIdx)) : null;
    const txCurNorm = txCurIdx >= 0 ? normalizeCurrencyCode(getValue(row, txCurIdx).trim()) : null;

    const useTxnCurrency =
      txAmt !== null && txAmt > 0 && txCurNorm !== null;

    let amount: number;
    let currency: string;
    let amountInAccountCurrency: number | undefined;
    let notes: string | undefined;

    if (useTxnCurrency) {
      amount = txAmt;
      currency = txCurNorm;
      if (acctAmt !== null && acctAmt > 0) {
        amountInAccountCurrency = acctAmt;
        if (acctCode && acctCode !== txCurNorm) {
          notes = `Equiv. importe en cuenta (${acctCode}): ${acctAmt}`;
        }
      }
    } else {
      if (acctAmt === null || acctAmt === 0) continue;
      amount = acctAmt;
      currency = acctCurNorm;
    }

    const account = getValue(row, accountIdx).trim();
    const category = categoryIdx >= 0 ? getValue(row, categoryIdx).trim() : '';
    const comment = commentIdx >= 0 ? getValue(row, commentIdx).trim() : '';
    const tags = tagsIdx >= 0 ? getValue(row, tagsIdx).trim() : '';
    const description = [comment, tags].filter(Boolean).join(' ').trim() || undefined;

    out.push({
      date: parsedDate.toISOString(),
      type: txType,
      amount,
      currency,
      account,
      category: category || undefined,
      description,
      notes,
      amountInAccountCurrency,
    });
  }

  return out;
}

function sheetCellToString(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    if (v > 20000 && v < 80000) {
      const cal = excelSerialToUtcCalendarDate(v);
      if (cal) {
        const y = cal.getUTCFullYear();
        const m = String(cal.getUTCMonth() + 1).padStart(2, '0');
        const d = String(cal.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
    return String(v);
  }
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}

/** Salta filas tipo "expenses list" hasta la fila de encabezados reales */
function findHeaderRowIndex(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const h0 = normalizeHeader(rows[i][0] || '');
    if (
      h0 === 'date and time' ||
      h0 === 'fecha' ||
      h0 === 'date' ||
      (h0.includes('fecha') && h0.length < 24)
    ) {
      return i;
    }
  }
  return -1;
}

interface ParsedImport {
  transactions: ImportedTransaction[];
  transfers: ImportedTransferRow[];
}

function parseXlsxWorkbook(buffer: ArrayBuffer, parseOpts: ParseImportDateOpts): ParsedImport {
  const out: ParsedImport = { transactions: [], transfers: [] };
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null | undefined)[]>(sheet, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][];

    const asStrings = matrix.map((row) =>
      (Array.isArray(row) ? row : []).map((cell) => sheetCellToString(cell))
    );
    const nonEmpty = asStrings.filter((r) => r.some((c) => c.length > 0));
    if (nonEmpty.length < 2) continue;

    let headerIdx = findHeaderRowIndex(nonEmpty);
    if (headerIdx < 0) headerIdx = 0;

    const headers = nonEmpty[headerIdx].map((h) => String(h));
    const dataRows = nonEmpty.slice(headerIdx + 1);

    const transferRows = tryParseTransferCSV(headers, dataRows, parseOpts);
    if (transferRows !== null) {
      out.transfers.push(...transferRows);
      continue;
    }

    const airtable = tryParseAirtableExpenseIncome(headers, dataRows, sheetName, parseOpts);
    if (airtable !== null) {
      out.transactions.push(...airtable);
      continue;
    }

    try {
      const unified = parseUnifiedFromGrid(headers, dataRows, parseOpts);
      if (unified.kind === 'transfer') {
        out.transfers.push(...unified.transfers);
      } else {
        out.transactions.push(...unified.transactions);
      }
    } catch {
      /* hoja no reconocida */
    }
  }

  return out;
}

function parseCSVUnified(
  text: string,
  parseOpts: ParseImportDateOpts
):
  | { kind: 'standard'; transactions: ImportedTransaction[] }
  | { kind: 'transfer'; transfers: ImportedTransferRow[] } {
  const { headers, rows } = parseCSVFile(text);
  return parseUnifiedFromGrid(headers, rows, parseOpts);
}

function collectUnresolvedAccountNames(
  accountMap: Map<string, { id: string; name: string; currency: string }>,
  transactions: ImportedTransaction[]
): string[] {
  return Array.from(
    new Set(
      transactions
        .map((t) => t.account?.trim())
        .filter((name): name is string =>
          Boolean(name && !accountMap.has(normalizeImportMatchKey(name)))
        )
    )
  );
}

function collectUnresolvedForTransfers(
  accountMap: Map<string, { id: string; name: string; currency: string }>,
  transfers: ImportedTransferRow[]
): string[] {
  const names = new Set<string>();
  for (const t of transfers) {
    const o = t.outgoingName.trim();
    const i = t.incomingName.trim();
    if (o && !accountMap.has(normalizeImportMatchKey(o))) names.add(o);
    if (i && !accountMap.has(normalizeImportMatchKey(i))) names.add(i);
  }
  return Array.from(names);
}

function resolveAccountId(
  rawName: string,
  accountMap: Map<string, { id: string; name: string; currency: string }>,
  resolutions: Record<string, UnresolvedResolution>,
  currency: string,
  allowCurrencyFallback = true,
  validAccountIds?: Set<string>
): { accountId: string | null; notesAppend: string | null; skipReason: string | null } {
  const trimmed = rawName.trim();
  if (!trimmed) {
    return { accountId: null, notesAppend: null, skipReason: 'Sin nombre de cuenta' };
  }

  const found = accountMap.get(normalizeImportMatchKey(trimmed));
  if (found) {
    return { accountId: found.id, notesAppend: null, skipReason: null };
  }

  const resolution = resolutions[trimmed] || null;
  const fallbackByCurrency = Array.from(accountMap.values()).find((a) => a.currency === currency);

  if (resolution?.action === 'map' && resolution.accountId) {
    if (validAccountIds && !validAccountIds.has(resolution.accountId)) {
      return {
        accountId: null,
        notesAppend: null,
        skipReason: 'La cuenta elegida en el mapeo ya no existe o está desactivada',
      };
    }
    return { accountId: resolution.accountId, notesAppend: null, skipReason: null };
  }
  if (resolution?.action === 'keep_name') {
    return {
      accountId: null,
      notesAppend: `Cuenta original importada: ${trimmed}`,
      skipReason: null,
    };
  }
  if (resolution?.action === 'none') {
    return { accountId: null, notesAppend: null, skipReason: null };
  }
  if (allowCurrencyFallback && fallbackByCurrency) {
    return { accountId: fallbackByCurrency.id, notesAppend: null, skipReason: null };
  }

  return {
    accountId: null,
    notesAppend: null,
    skipReason: `Cuenta "${trimmed}" no resuelta`,
  };
}

function formatTxContext(tx: ImportedTransaction): string {
  const parts = [
    tx.date ? `Fecha: ${String(tx.date).slice(0, 10)}` : null,
    tx.amount != null ? `Monto: ${tx.amount} ${tx.currency}` : null,
    tx.description ? `Desc.: ${tx.description}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function formatTransferContext(tr: ImportedTransferRow): string {
  const parts = [
    tr.date ? `Fecha: ${String(tr.date).slice(0, 10)}` : null,
    `Monto: ${tr.amountOutgoing} ${tr.currencyOutgoing}`,
    tr.comment ? `Nota: ${tr.comment}` : null,
  ].filter(Boolean);
  return parts.join(' · ');
}

function suggestionForUnresolvedTransferName(rawName: string, side: 'origen' | 'destino'): string {
  const n = rawName.trim();
  if (!n) {
    return `Completá la columna de ${side} en el archivo. El nombre debe coincidir con una cuenta activa en Zarix (pestaña Cuentas), salvo tildes/mayúsculas.`;
  }
  return `Creá en Zarix una cuenta llamada como en el archivo o, si ya existe con otro nombre, en la pantalla de revisión del import asigná "${n}" a la cuenta correcta.`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const mode = (formData.get('mode') as string) || 'import';
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      return NextResponse.json(
        { error: `El archivo supera el máximo permitido (${MAX_IMPORT_FILE_BYTES / (1024 * 1024)} MB)` },
        { status: 413 }
      );
    }

    const rawDateFmt = (formData.get('dateFormat') as string) || 'dmy';
    const ambiguousOrder: ImportDateAmbiguousOrder = rawDateFmt === 'mdy' ? 'mdy' : 'dmy';
    const dateParseOpts: ParseImportDateOpts = { ambiguousOrder };

    const lowerName = file.name.toLowerCase();

    let combined: ParsedImport;

    if (lowerName.endsWith('.json')) {
      const text = await file.text();
      const json = JSON.parse(text);
      if (Array.isArray(json)) {
        combined = {
          transfers: [],
          transactions: json.map((tx: any) => {
            const amt = parseImportAmount(tx.amount) || 0;
            const amtAcct =
              typeof tx.amount_in_account_currency === 'number' &&
              Number.isFinite(tx.amount_in_account_currency)
                ? Math.abs(tx.amount_in_account_currency)
                : typeof tx.amountInAccountCurrency === 'number' &&
                    Number.isFinite(tx.amountInAccountCurrency)
                  ? Math.abs(tx.amountInAccountCurrency)
                  : undefined;
            return {
              date:
                parseImportDate(tx.date || tx.transaction_date || '', dateParseOpts)?.toISOString() ||
                new Date().toISOString(),
              type: tx.type || 'expense',
              amount: amt,
              currency: tx.currency || 'ARS',
              account: tx.account || tx.accountName || '',
              category: tx.category || tx.categoryName,
              description: tx.description,
              notes: tx.notes,
              amountInAccountCurrency: amtAcct,
            };
          }),
        };
      } else if (json.data?.transactions) {
        combined = {
          transfers: [],
          transactions: json.data.transactions.map((tx: any) => ({
            date:
              parseImportDate(tx.transaction_date || '', dateParseOpts)?.toISOString() ||
              new Date().toISOString(),
            type: tx.type || 'expense',
            amount: parseImportAmount(tx.amount) || 0,
            currency: tx.currency || 'ARS',
            account: '',
            category: undefined,
            description: tx.description,
            notes: tx.notes,
          })),
        };
      } else {
        return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
      }
    } else if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
      const buffer = await file.arrayBuffer();
      combined = parseXlsxWorkbook(buffer, dateParseOpts);
    } else {
      const text = await file.text();
      const parsed = parseCSVUnified(text, dateParseOpts);
      combined =
        parsed.kind === 'transfer'
          ? { transactions: [], transfers: parsed.transfers }
          : { transactions: parsed.transactions, transfers: [] };
    }

    const totalCount = combined.transactions.length + combined.transfers.length;

    if (totalCount === 0) {
      return NextResponse.json({ error: 'No transactions found in file' }, { status: 400 });
    }

    const serviceSupabase = createServiceClientSync();

    const { data: accountsRaw } = await serviceSupabase
      .from('accounts')
      .select('id, name, currency')
      .eq('user_id', user.id)
      .eq('is_active', true);

    const accounts = [...(accountsRaw || [])].sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })
    );

    const { data: categories } = await serviceSupabase
      .from('categories')
      .select('id, name')
      .or(`user_id.eq.${user.id},is_system.eq.true`);

    const accountMap = buildImportLookupMap(accounts || []);
    const validAccountIds = new Set(accounts.map((a) => a.id));
    const categoryMap = buildImportLookupMap(categories || []);

    const unresolvedTransfers = collectUnresolvedForTransfers(accountMap, combined.transfers);
    const unresolvedStandard = collectUnresolvedAccountNames(accountMap, combined.transactions);
    const unresolvedAccountNames = Array.from(
      new Set([...unresolvedTransfers, ...unresolvedStandard])
    );

    const importKindPreview =
      combined.transfers.length > 0 && combined.transactions.length > 0
        ? 'mixed'
        : combined.transfers.length > 0
          ? 'transfer'
          : 'standard';

    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        total: totalCount,
        importKind: importKindPreview,
        unresolvedAccounts: unresolvedAccountNames,
        accounts: (accounts || []).map((a) => ({ id: a.id, name: a.name, currency: a.currency })),
      });
    }

    let resolutions: Record<string, UnresolvedResolution> = {};
    try {
      const rawResolutions = formData.get('resolutions') as string | null;
      resolutions = rawResolutions ? JSON.parse(rawResolutions) : {};
    } catch {
      resolutions = {};
    }

    let imported = 0;
    let skipped = 0;
    const skippedDetails: ImportSkippedDetail[] = [];

    const pushSkip = (detail: ImportSkippedDetail) => {
      skipped++;
      if (skippedDetails.length < MAX_SKIPPED_DETAILS) {
        skippedDetails.push(detail);
      }
    };

    for (const tr of combined.transfers) {
      const outRes = resolveAccountId(
        tr.outgoingName,
        accountMap,
        resolutions,
        tr.currencyOutgoing,
        false,
        validAccountIds
      );
      const inRes = resolveAccountId(
        tr.incomingName,
        accountMap,
        resolutions,
        tr.currencyIncoming || tr.currencyOutgoing,
        false,
        validAccountIds
      );

      if (outRes.skipReason || !outRes.accountId) {
        const raw = tr.outgoingName?.trim() || '';
        pushSkip({
          title: `Transferencia omitida — origen "${raw || '(vacío)'}"`,
          reason:
            outRes.skipReason ||
            (!outRes.accountId
              ? 'No hay cuenta de origen válida (p. ej. nombre vacío o sin mapear).'
              : 'No se pudo determinar la cuenta de origen.'),
          suggestion: suggestionForUnresolvedTransferName(tr.outgoingName, 'origen'),
          context: formatTransferContext(tr),
        });
        continue;
      }
      if (inRes.skipReason || !inRes.accountId) {
        const raw = tr.incomingName?.trim() || '';
        pushSkip({
          title: `Transferencia omitida — destino "${raw || '(vacío)'}"`,
          reason:
            inRes.skipReason ||
            (!inRes.accountId
              ? 'No hay cuenta de destino válida.'
              : 'No se pudo determinar la cuenta de destino.'),
          suggestion: suggestionForUnresolvedTransferName(tr.incomingName, 'destino'),
          context: formatTransferContext(tr),
        });
        continue;
      }

      if (outRes.accountId === inRes.accountId) {
        pushSkip({
          title: 'Transferencia omitida — origen y destino iguales',
          reason: 'Origen y destino apuntan a la misma cuenta en Zarix; una transferencia requiere dos cuentas distintas.',
          suggestion:
            'Corregí el archivo: dos columnas distintas con nombres de cuentas diferentes, o dividí en dos movimientos (egreso en una cuenta e ingreso manual en la otra).',
          context: formatTransferContext(tr),
        });
        continue;
      }

      let description = tr.comment || 'Transferencia importada';
      if (tr.amountIncoming && tr.currencyIncoming && tr.currencyIncoming !== tr.currencyOutgoing) {
        description += ` (${tr.amountIncoming} ${tr.currencyIncoming} en destino)`;
      }

      try {
        await transactionsService.create({
          userId: user.id,
          type: 'transfer',
          accountId: outRes.accountId,
          destinationAccountId: inRes.accountId,
          amount: tr.amountOutgoing,
          currency: tr.currencyOutgoing,
          description,
          transactionDate: tr.date,
        });
        imported++;
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        pushSkip({
          title: `Transferencia omitida — ${tr.outgoingName} → ${tr.incomingName}`,
          reason: `Error al crear el movimiento: ${errMsg}`,
          suggestion:
            'Revisá monedas, montos y que ambas cuentas existan. Si el error menciona validación, ajustá el archivo y reintentá.',
          context: formatTransferContext(tr),
        });
      }
    }

    for (const tx of combined.transactions) {
      const rawAccountName = (tx.account || '').trim();
      const hasAccountInFile = rawAccountName.length > 0;
      let account = hasAccountInFile ? accountMap.get(normalizeImportMatchKey(rawAccountName)) : undefined;

      let accountId: string | null = null;
      let description = tx.description || null;
      let notes = tx.notes || null;

      if (account) {
        accountId = account.id;
      } else {
        const fallbackByCurrency = Array.from(accountMap.values()).find(
          (a) => a.currency === tx.currency
        );
        const resolution = hasAccountInFile ? resolutions[rawAccountName] || null : null;

        if (resolution?.action === 'map' && resolution.accountId) {
          if (!validAccountIds.has(resolution.accountId)) {
            pushSkip({
              title: `Movimiento omitido — cuenta "${rawAccountName}"`,
              reason:
                'El mapeo apunta a una cuenta que ya no existe o fue desactivada; actualizá la revisión del import.',
              suggestion:
                'Volvé a previsualizar el archivo para refrescar la lista de cuentas y elegí otra cuenta, o creá la cuenta en Zarix antes de importar.',
              context: formatTxContext(tx),
            });
            continue;
          }
          accountId = resolution.accountId;
        } else if (resolution?.action === 'keep_name') {
          if (rawAccountName) {
            const annotation = `Cuenta original importada: ${rawAccountName}`;
            notes = notes ? `${notes} | ${annotation}` : annotation;
          }
          accountId = null;
        } else if (resolution?.action === 'none') {
          accountId = null;
        } else if (!hasAccountInFile && fallbackByCurrency) {
          accountId = fallbackByCurrency.id;
        } else if (!hasAccountInFile) {
          accountId = null;
        } else {
          pushSkip({
            title: `Movimiento omitido — cuenta "${rawAccountName}"`,
            reason:
              'Ese nombre no coincide con ninguna cuenta en Zarix y no elegiste una acción en la pantalla de revisión (mapear, sin cuenta o nota).',
            suggestion:
              'Volvé a importar el archivo: en el paso de cuentas no reconocidas, asigná esta fila a una cuenta existente, o renombrá el texto en el CSV para que coincida con el nombre en Zarix (tildes no importan).',
            context: formatTxContext(tx),
          });
          continue;
        }
      }

      const category = tx.category
        ? categoryMap.get(normalizeImportMatchKey(tx.category))
        : null;

      try {
        if (tx.type === 'transfer') {
          pushSkip({
            title: 'Movimiento omitido — tipo transferencia en archivo de movimientos',
            reason:
              'Esta fila está marcada como transferencia; el import masivo de gastos/ingresos no crea transferencias entre cuentas.',
            suggestion:
              'Usá el formato de transferencias (columnas Origen y Destino) en otro CSV/Excel, o cambiá el tipo a Gasto/Ingreso si corresponde a un solo lado.',
            context: formatTxContext(tx),
          });
          continue;
        }

        const { error: insertError } = await serviceSupabase.from('transactions').insert({
          user_id: user.id,
          type: tx.type,
          account_id: accountId,
          amount: tx.amount,
          currency: tx.currency,
          amount_in_account_currency: tx.amountInAccountCurrency ?? tx.amount,
          category_id: category?.id || null,
          description,
          notes,
          transaction_date: tx.date,
        });

        if (insertError) {
          pushSkip({
            title: `Movimiento omitido — ${tx.description || 'sin descripción'}`,
            reason: `Error al guardar: ${insertError.message}${insertError.code ? ` (${insertError.code})` : ''}`,
            suggestion:
              'Revisá fecha (formato válido), monto numérico, moneda y que el tipo (gasto/ingreso) sea coherente. Si falta cuenta y la base lo exige, asigná cuenta en el archivo o en la revisión.',
            context: formatTxContext(tx),
          });
          continue;
        }

        imported++;
      } catch (e: unknown) {
        const errMsg = e instanceof Error ? e.message : String(e);
        pushSkip({
          title: `Movimiento omitido — ${tx.description || 'sin descripción'}`,
          reason: `Error inesperado: ${errMsg}`,
          suggestion:
            'Verificá el formato del archivo y reintentá. Si persiste, exportá un CSV de ejemplo desde Zarix y compará columnas.',
          context: formatTxContext(tx),
        });
      }
    }

    const truncated = skipped > skippedDetails.length;
    const errorsLegacy = skippedDetails.map((d) => `${d.title}: ${d.reason}`);

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      total: totalCount,
      importKind: importKindPreview,
      /** @deprecated Preferir skippedDetails */
      errors: errorsLegacy,
      skippedDetails,
      skippedDetailsTruncated: truncated,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Import failed',
    }, { status: 500 });
  }
}
