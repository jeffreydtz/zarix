/**
 * Importador de la planilla "Mi Portafolio" de IOL (CSV/Excel).
 * Sin credenciales ni llamadas a la API de IOL.
 */

import { createHash } from 'node:crypto';
import type { InvestmentType } from '@/types/database';
import { parseCSVFile } from '@/lib/import/csv';

export interface IolHoldingRow {
  ticker: string;
  name: string;
  type: InvestmentType;
  quantity: number;
  purchasePrice: number;
  lastPrice: number | null;
  purchaseCurrency: string;
  marketCurrency: string;
  paymentCurrency: string | null;
  /** Siempre null: el export de portafolio no trae lote/fecha confiable. */
  purchaseDate: string | null;
  law: string | null;
}

export interface IolParseResult {
  holdings: IolHoldingRow[];
  skipped: Array<{ reason: string; raw: Record<string, string> }>;
}

/** Excel numeric cells stay numbers so locale parsing cannot inflate them. */
export type IolCell = string | number;

type NumberLocale = 'es-AR' | 'decimal';

function foldHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

const HEADER_ALIASES: Record<string, string[]> = {
  ticker: ['simbolo', 'ticker', 'especie', 'symbol', 'codigo', 'paper'],
  name: ['descripcion', 'nombre', 'name', 'especie', 'titulo'],
  quantity: ['cantidad', 'quantity', 'nominal', 'vn', 'qty'],
  lastPrice: ['ultimo', 'ultimoprecio', 'precio', 'last', 'lastprice', 'px'],
  purchasePrice: ['ppc', 'ppac', 'preciopromedio', 'preciopromediodecompra', 'costo', 'precioactual'],
  currency: ['moneda', 'currency', 'ccy'],
  type: ['tipo', 'type', 'instrumento', 'asset', 'clase'],
};

function mapHeaders(headers: string[]): Map<string, number> {
  const folded = headers.map(foldHeader);
  const out = new Map<string, number>();
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = folded.findIndex((h) => aliases.includes(h));
    if (idx >= 0 && !out.has(field)) out.set(field, idx);
  }
  if (!out.has('ticker') && out.has('name')) out.set('ticker', out.get('name')!);
  return out;
}

function numericSample(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || trimmed === '—') return null;
  const cleaned = trimmed.replace(/\s/g, '').replace(/[^\d,.]/g, '');
  return cleaned || null;
}

function detectNumberLocale(rows: IolCell[][], map: Map<string, number>): NumberLocale {
  const idxs = ['quantity', 'purchasePrice', 'lastPrice']
    .map((key) => map.get(key))
    .filter((idx): idx is number => idx != null);
  let commaDecimal = false;
  let multiDotGroups = false;
  let integerThousands = 0;
  let ambiguousThreeDigit = 0;
  let trueDecimals = 0;
  for (const row of rows) {
    for (const idx of idxs) {
      const value = row[idx];
      if (typeof value !== 'string') continue;
      const cleaned = numericSample(value);
      if (!cleaned) continue;
      const hasComma = cleaned.includes(',');
      const hasDot = cleaned.includes('.');
      if (hasComma) commaDecimal = true;
      if (!hasDot || hasComma) continue;
      const parts = cleaned.split('.');
      if (parts.length > 2) {
        multiDotGroups = true;
        continue;
      }
      const fraction = parts[1] ?? '';
      if (fraction.length === 1 || fraction.length === 2 || parts[0] === '0') {
        trueDecimals += 1;
      } else if (fraction.length === 3 && fraction === '000') {
        integerThousands += 1;
      } else if (fraction.length === 3) {
        ambiguousThreeDigit += 1;
      } else {
        trueDecimals += 1;
      }
    }
  }
  if (commaDecimal || multiDotGroups) return 'es-AR';
  // `1.000` / `90.000` look like es-AR thousands only when the file has no
  // real decimals (`0.125`, `91.5`) and no 3-place prices (`92.345`).
  if (integerThousands > 0 && trueDecimals === 0 && ambiguousThreeDigit === 0) {
    return 'es-AR';
  }
  return 'decimal';
}

function parseNumber(raw: IolCell | undefined, locale: NumberLocale = 'decimal'): number | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || trimmed === '—') return null;
  const sign = trimmed.startsWith('-') ? -1 : 1;
  const cleaned = numericSample(trimmed);
  if (!cleaned) return null;
  const hasComma = cleaned.includes(',');
  const hasDot = cleaned.includes('.');
  let normalized = cleaned;
  if (hasComma && hasDot) {
    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    if (lastComma > lastDot) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = cleaned.replace(/,/g, '');
    }
  } else if (hasComma) {
    normalized = cleaned.replace(',', '.');
  } else if (hasDot) {
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      const decimals = parts[parts.length - 1];
      const groups = parts.slice(1, -1);
      if (decimals.length === 3 && groups.every((g) => g.length === 3)) {
        normalized = parts.join('');
      } else {
        normalized = `${parts.slice(0, -1).join('')}.${decimals}`;
      }
    } else if (locale === 'es-AR' && parts[1].length === 3) {
      normalized = `${parts[0]}${parts[1]}`;
    }
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n * sign : null;
}

/** Keep `$` so `US$` / `U$S` / `$` stay distinct after folding. */
function foldCurrencyLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function compactCurrency(folded: string): string {
  return folded.replace(/[^A-Z0-9$]/g, '');
}

const USD_LABELS = new Set([
  'USD',
  'US$',
  'U$S',
  'USS',
  'DOLAR',
  'DOLARES',
  'DOLARMEP',
  'DOLARESMEP',
  'DOLARCABLE',
  'DOLARESCABLE',
  'DOLARCCL',
  'DOLARESCCL',
]);

const ARS_LABELS = new Set(['ARS', 'PESO', 'PESOS', '$']);

function parseCurrency(raw: string | undefined): string | null {
  const original = (raw || '').trim();
  if (!original) return 'ARS';
  const compact = compactCurrency(foldCurrencyLabel(original));
  if (USD_LABELS.has(compact)) return 'USD';
  if (ARS_LABELS.has(compact)) return 'ARS';
  return null;
}

function mapType(raw: string | undefined, ticker: string): InvestmentType {
  const t = foldHeader(raw || '');
  const sym = ticker.toUpperCase();
  if (t.includes('cedear')) return 'cedear';
  if (t === 'on' || t.includes('obligacion')) return 'on';
  if (t.includes('fci') || t.includes('fondo')) return 'fci';
  if (t.includes('bono') || t.includes('bond') || t.includes('letra') || t.includes('soberan')) return 'bond';
  if (t.includes('crypto') || t.includes('cripto') || t.includes('btc')) return 'crypto';
  if (t.includes('accion') || t.includes('equity') || t.includes('share')) {
    if (['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META'].includes(sym) || t.includes('usa') || t.includes('nyse') || t.includes('nasdaq')) {
      return t.includes('arg') || t.includes('byma') || t.includes('merval') ? 'stock_arg' : 'stock_us';
    }
    if (t.includes('usa') || t.includes('nasdaq') || t.includes('nyse')) return 'stock_us';
    return 'stock_arg';
  }
  if (t.includes('etf')) return 'etf';
  if (sym.endsWith('O') && sym.length >= 5) return 'on';
  return 'other';
}

function cell(row: IolCell[], index: number | undefined): IolCell {
  if (index == null || index < 0 || index >= row.length) return '';
  return row[index] ?? '';
}

function cellText(row: IolCell[], index: number | undefined): string {
  const value = cell(row, index);
  return typeof value === 'string' ? value : String(value);
}

/**
 * Preserve ExcelJS numbers (including formula results). Stringifying a numeric
 * 92.345 would later be read as es-AR thousands (92345).
 */
export function iolCellFromExcel(value: unknown): IolCell {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'string') return value;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString();
  }
  if (typeof value === 'object') {
    const obj = value as { result?: unknown; richText?: Array<{ text?: string }>; text?: unknown };
    if ('result' in obj) return iolCellFromExcel(obj.result);
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((part) => part?.text ?? '').join('');
    }
    if (obj.text != null) return iolCellFromExcel(obj.text);
  }
  return String(value);
}

export function excelWorksheetToIolTable(sheet: {
  eachRow: (cb: (row: { values: unknown }) => void) => void;
}): { headers: string[]; rows: IolCell[][] } {
  const matrix: IolCell[][] = [];
  sheet.eachRow((row) => {
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    matrix.push(values.map((value) => iolCellFromExcel(value)));
  });
  if (matrix.length === 0) return { headers: [], rows: [] };
  return {
    headers: matrix[0].map((header) => (typeof header === 'string' ? header : String(header))),
    rows: matrix.slice(1),
  };
}

export function parseIolPortfolioTable(headers: string[], rows: IolCell[][]): IolParseResult {
  const map = mapHeaders(headers);
  const holdings: IolHoldingRow[] = [];
  const skipped: IolParseResult['skipped'] = [];
  const tickerIdx = map.get('ticker');
  if (tickerIdx == null) {
    return { holdings, skipped: [{ reason: 'No hay columna de símbolo/especie', raw: {} }] };
  }
  const locale = detectNumberLocale(rows, map);

  for (const row of rows) {
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => { raw[h] = row[i] == null ? '' : String(row[i]); });
    const ticker = cellText(row, tickerIdx).trim().toUpperCase().replace(/\.BA$/i, '');
    if (!ticker || ticker === 'TOTAL' || ticker === 'ESPECIE') {
      skipped.push({ reason: 'Fila sin ticker', raw });
      continue;
    }
    const quantity = parseNumber(cell(row, map.get('quantity')), locale);
    if (quantity == null || quantity <= 0) {
      skipped.push({ reason: 'Cantidad inválida', raw });
      continue;
    }
    const purchase = parseNumber(cell(row, map.get('purchasePrice')), locale)
      ?? parseNumber(cell(row, map.get('lastPrice')), locale);
    if (purchase == null || purchase <= 0) {
      skipped.push({ reason: 'Precio inválido', raw });
      continue;
    }
    const lastPrice = parseNumber(cell(row, map.get('lastPrice')), locale);
    const currency = parseCurrency(cellText(row, map.get('currency')));
    if (!currency) {
      skipped.push({ reason: 'Moneda no reconocida', raw });
      continue;
    }
    const type = mapType(cellText(row, map.get('type')), ticker);
    const name = cellText(row, map.get('name')).trim() || ticker;
    holdings.push({
      ticker,
      name,
      type,
      quantity,
      purchasePrice: purchase,
      lastPrice: lastPrice != null && lastPrice > 0 ? lastPrice : null,
      purchaseCurrency: currency,
      marketCurrency: currency,
      paymentCurrency: type === 'bond' || type === 'on' ? currency : null,
      purchaseDate: null,
      law: type === 'on' || type === 'bond' ? null : null,
    });
  }
  return { holdings, skipped };
}

export function parseIolPortfolioCsv(text: string): IolParseResult {
  const parsed = parseCSVFile(text);
  return parseIolPortfolioTable(parsed.headers, parsed.rows);
}

export function iolHoldingToCreateInput(row: IolHoldingRow, accountId: string) {
  return {
    accountId,
    type: row.type,
    ticker: row.ticker,
    name: row.name,
    quantity: row.quantity,
    purchasePrice: row.purchasePrice,
    purchaseCurrency: row.purchaseCurrency,
    purchaseDate: row.purchaseDate,
    marketCurrency: row.marketCurrency,
    paymentCurrency: row.paymentCurrency,
    isManualPrice: false,
    currentPrice: row.lastPrice ?? undefined,
  };
}

/**
 * Stable create_investment_once key for a parsed IOL row.
 * Identity is ticker/account/row — not quantity or price — so a later file
 * with a different PPC still collides instead of inserting a duplicate.
 */
export function iolImportRequestId(
  userId: string,
  accountId: string,
  holding: Pick<IolHoldingRow, 'ticker' | 'type' | 'purchaseCurrency' | 'marketCurrency'>,
  rowIndex: number
): string {
  const digest = createHash('sha256')
    .update(
      [
        userId,
        accountId,
        holding.ticker,
        holding.type,
        holding.purchaseCurrency,
        holding.marketCurrency,
        String(rowIndex),
      ].join('|')
    )
    .digest('hex')
    .slice(0, 24);
  const ticker = holding.ticker.replace(/[^A-Za-z0-9._-]/g, '').slice(0, 24) || 'row';
  return `iol.${ticker}.${rowIndex}.${digest}`;
}
