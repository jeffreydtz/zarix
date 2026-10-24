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

function parseNumber(raw: string | undefined): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '-' || trimmed === '—') return null;
  const sign = trimmed.startsWith('-') ? -1 : 1;
  const cleaned = trimmed.replace(/\s/g, '').replace(/[^\d,.]/g, '');
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
    } else if (parts[1].length === 3) {
      // es-AR integer thousands: "1.000", "90.000". Plain decimals use 1–2 places.
      normalized = `${parts[0]}${parts[1]}`;
    }
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n * sign : null;
}

const KNOWN_CURRENCIES = new Set(['USD', 'ARS', 'EUR']);

function parseCurrency(raw: string | undefined): string | null {
  const folded = foldHeader(raw || '');
  if (!folded) return 'ARS';
  if (
    folded.includes('usd') ||
    folded.includes('dolar') ||
    folded === 'us' ||
    folded === 'uss'
  ) {
    return 'USD';
  }
  if (folded.includes('ars') || folded.includes('peso')) return 'ARS';
  if (folded.includes('eur') || folded.includes('euro')) return 'EUR';
  const upper = folded.toUpperCase();
  if (KNOWN_CURRENCIES.has(upper)) return upper;
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

function cell(row: string[], index: number | undefined): string {
  if (index == null || index < 0 || index >= row.length) return '';
  return row[index] ?? '';
}

export function parseIolPortfolioTable(headers: string[], rows: string[][]): IolParseResult {
  const map = mapHeaders(headers);
  const holdings: IolHoldingRow[] = [];
  const skipped: IolParseResult['skipped'] = [];
  const tickerIdx = map.get('ticker');
  if (tickerIdx == null) {
    return { holdings, skipped: [{ reason: 'No hay columna de símbolo/especie', raw: {} }] };
  }

  for (const row of rows) {
    const raw: Record<string, string> = {};
    headers.forEach((h, i) => { raw[h] = row[i] ?? ''; });
    const ticker = cell(row, tickerIdx).trim().toUpperCase().replace(/\.BA$/i, '');
    if (!ticker || ticker === 'TOTAL' || ticker === 'ESPECIE') {
      skipped.push({ reason: 'Fila sin ticker', raw });
      continue;
    }
    const quantity = parseNumber(cell(row, map.get('quantity')));
    if (quantity == null || quantity <= 0) {
      skipped.push({ reason: 'Cantidad inválida', raw });
      continue;
    }
    const purchase = parseNumber(cell(row, map.get('purchasePrice')))
      ?? parseNumber(cell(row, map.get('lastPrice')));
    if (purchase == null || purchase <= 0) {
      skipped.push({ reason: 'Precio inválido', raw });
      continue;
    }
    const lastPrice = parseNumber(cell(row, map.get('lastPrice')));
    const currency = parseCurrency(cell(row, map.get('currency')));
    if (!currency) {
      skipped.push({ reason: 'Moneda no reconocida', raw });
      continue;
    }
    const type = mapType(cell(row, map.get('type')), ticker);
    const name = cell(row, map.get('name')).trim() || ticker;
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

/** Stable create_investment_once key for a parsed IOL row. Same file → same id. */
export function iolImportRequestId(
  userId: string,
  accountId: string,
  holding: Pick<
    IolHoldingRow,
    'ticker' | 'type' | 'quantity' | 'purchasePrice' | 'purchaseCurrency' | 'marketCurrency'
  >,
  rowIndex: number
): string {
  const digest = createHash('sha256')
    .update(
      [
        userId,
        accountId,
        holding.ticker,
        holding.type,
        String(holding.quantity),
        String(holding.purchasePrice),
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
