/**
 * Compara archivos CSV de la carpeta de import (Airtable / export manual)
 * contra los movimientos en la base (Supabase) o un JSON exportado.
 *
 * Opción A — directo desde DB (usa .env.local: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
 *   npx tsx scripts/compare-import-with-export.ts /ruta/a/import --supabase
 *   Opcional: COMPARE_USER_ID=<uuid> si hay más de un usuario en `users`.
 *
 * Opción B — JSON exportado (sesión iniciada):
 *   GET /api/export/transactions?format=json
 *   npx tsx scripts/compare-import-with-export.ts /ruta/a/import ./zarix-transactions.json
 *
 * Uso solo CSV (conteos):
 *   npx tsx scripts/compare-import-with-export.ts /ruta/a/import
 */

import * as fs from 'fs';
import * as path from 'path';
import { config as loadEnv } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type RowKind = 'expense' | 'income' | 'transfer';

interface NormalizedRow {
  kind: RowKind;
  date: string; // YYYY-MM-DD
  amount: number;
  currency: string;
  account: string;
  category: string;
  description: string;
  /** transferencias: cuenta destino */
  destinationAccount: string;
  amountIncoming?: number;
  currencyIncoming?: string;
}

function parseAmountLoose(raw: string): number | null {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s/g, '');
  if (!s) return null;
  let normalized = s.replace(/[^\d.,\-]/g, '');
  if (!normalized) return null;

  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  if (lastComma > lastDot) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else if (lastComma >= 0 && lastDot >= 0) {
    normalized = normalized.replace(/,/g, '');
  } else if (lastComma > 0 && lastDot === -1) {
    const parts = normalized.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = `${parts[0]}.${parts[1]}`;
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

function parseDateToYmd(raw: string): string | null {
  const datePart = (raw || '').trim().split(/\s+/)[0] ?? raw;
  if (!datePart) return null;

  const isoTry = new Date(raw);
  if (!Number.isNaN(isoTry.getTime())) {
    return isoTry.toISOString().slice(0, 10);
  }

  const mdY = datePart.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (mdY) {
    const month = Number(mdY[1]);
    const day = Number(mdY[2]);
    let year = Number(mdY[3]);
    if (year < 100) year += 2000;
    const d = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  const dmy = datePart.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const d = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }

  return null;
}

function norm(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

function fingerprint(r: NormalizedRow): string {
  const amt = r.amount.toFixed(2);
  if (r.kind === 'transfer') {
    return `${r.kind}|${r.date}|${amt}|${norm(r.currency)}|${norm(r.account)}|${norm(r.destinationAccount)}`;
  }
  return [
    r.kind,
    r.date,
    amt,
    norm(r.currency),
    norm(r.account),
    norm(r.category),
    norm(r.description),
  ].join('|');
}

function addToBag(bag: Map<string, number>, key: string) {
  bag.set(key, (bag.get(key) ?? 0) + 1);
}

function subFromBag(bag: Map<string, number>, key: string) {
  const n = (bag.get(key) ?? 0) - 1;
  if (n <= 0) bag.delete(key);
  else bag.set(key, n);
}

function parseExpensesFile(text: string): NormalizedRow[] {
  const lines = text.trim().split(/\r?\n/);
  const out: NormalizedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.includes(';') ? line.split(';') : line.split(',');
    if (parts.length < 5) continue;

    const dateStr = parts[0];
    const tipoRaw = (parts[1] || '').toLowerCase();
    const amount = parseAmountLoose(parts[2] || '');
    const currency = (parts[3] || 'ARS').trim();
    const account = parts[4] || '';
    const category = parts[5] || '';
    const description = parts.slice(6).join(';') || '';

    if (amount === null || amount === 0) continue;
    const date = parseDateToYmd(dateStr);
    if (!date) continue;

    let kind: RowKind = 'expense';
    if (tipoRaw.includes('ingreso')) kind = 'income';
    else if (tipoRaw.includes('transfer')) kind = 'transfer';

    out.push({
      kind,
      date,
      amount,
      currency,
      account,
      category,
      description,
      destinationAccount: '',
    });
  }
  return out;
}

function parseIncomeFile(text: string): NormalizedRow[] {
  const lines = text.trim().split(/\r?\n/);
  const out: NormalizedRow[] = [];
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/date\s+and\s+time/i.test(lines[i]) && lines[i].includes(';')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return out;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(';');
    if (parts.length < 7) continue;

    const date = parseDateToYmd(parts[0] || '');
    const account = parts[2] || '';
    const amountAccount = parseAmountLoose(parts[5] || '');
    const currencyAccount = (parts[6] || 'ARS').trim();

    if (amountAccount === null || amountAccount === 0) continue;
    if (!date) continue;

    const category = parts[1] || '';
    const comment = parts.slice(7).join(';').trim();

    out.push({
      kind: 'income',
      date,
      amount: amountAccount,
      currency: currencyAccount,
      account,
      category,
      description: comment,
      destinationAccount: '',
    });
  }
  return out;
}

function parseTransfersFile(text: string): NormalizedRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(';').map((h) => h.trim().toLowerCase());
  const dateIdx = header.findIndex((h) => /date\s+and\s+time|^fecha/.test(h));
  const outIdx = header.findIndex((h) => h === 'outgoing');
  const inIdx = header.findIndex((h) => h === 'incoming');
  const amtOutIdx = header.findIndex((h) => h.includes('outgoing') && h.includes('amount'));
  const curOutIdx = header.findIndex((h) => h.includes('outgoing') && h.includes('currency'));
  const amtInIdx = header.findIndex((h) => h.includes('incoming') && h.includes('amount'));
  const curInIdx = header.findIndex((h) => h.includes('incoming') && h.includes('currency'));
  const commentIdx = header.findIndex((h) => h === 'comment' || h === 'comentario');

  if (dateIdx < 0 || outIdx < 0 || inIdx < 0 || amtOutIdx < 0 || curOutIdx < 0) {
    console.warn('Transfers CSV: no se reconocieron columnas esperadas.');
    return [];
  }

  const out: NormalizedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const parts = line.split(';');
    const date = parseDateToYmd(parts[dateIdx] || '');
    const outgoing = (parts[outIdx] || '').trim();
    const incoming = (parts[inIdx] || '').trim();
    const amountOutgoing = parseAmountLoose(parts[amtOutIdx] || '');
    const currencyOutgoing = (parts[curOutIdx] || 'ARS').trim();
    let amountIncoming: number | undefined;
    let currencyIncoming: string | undefined;
    if (amtInIdx >= 0) {
      const v = parseAmountLoose(parts[amtInIdx] || '');
      if (v !== null && v > 0) amountIncoming = v;
    }
    if (curInIdx >= 0 && parts[curInIdx]?.trim()) {
      currencyIncoming = parts[curInIdx].trim();
    }
    const comment =
      commentIdx >= 0 ? parts.slice(commentIdx).join(';').trim() : '';

    if (!date || !outgoing || !incoming || amountOutgoing === null || amountOutgoing === 0) {
      continue;
    }

    out.push({
      kind: 'transfer',
      date,
      amount: amountOutgoing,
      currency: currencyOutgoing,
      account: outgoing,
      category: '',
      description: comment || 'Transferencia importada',
      destinationAccount: incoming,
      amountIncoming,
      currencyIncoming,
    });
  }
  return out;
}

function loadExportJson(filePath: string): NormalizedRow[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw) as Array<{
    type: string;
    amount: number;
    currency: string;
    account: string;
    destinationAccount?: string;
    category: string;
    description: string;
    notes?: string;
    date: string;
  }>;

  return data.map((tx) => {
    const date = parseDateToYmd(tx.date) || new Date(tx.date).toISOString().slice(0, 10);
    const kind = tx.type as RowKind;
    const desc = [tx.description || '', tx.notes || ''].filter(Boolean).join(' ').trim();
    return {
      kind: kind === 'transfer' ? 'transfer' : kind === 'income' ? 'income' : 'expense',
      date,
      amount: Math.abs(Number(tx.amount) || 0),
      currency: tx.currency || 'ARS',
      account: tx.account || '',
      category: tx.category || '',
      description: kind === 'transfer' ? '' : desc,
      destinationAccount: tx.destinationAccount || '',
      amountIncoming: undefined,
      currencyIncoming: undefined,
    };
  });
}

function mapDbRowToNormalized(tx: {
  type: string;
  amount: number;
  currency: string;
  transaction_date: string;
  description: string | null;
  notes: string | null;
  category?: { name: string } | null;
  account?: { name: string; currency: string } | null;
  destination_account?: { name: string; currency: string } | null;
}): NormalizedRow {
  const date =
    parseDateToYmd(tx.transaction_date) ||
    new Date(tx.transaction_date).toISOString().slice(0, 10);
  const kind = tx.type as RowKind;
  const desc = [tx.description || '', tx.notes || ''].filter(Boolean).join(' ').trim();
  return {
    kind: kind === 'transfer' ? 'transfer' : kind === 'income' ? 'income' : 'expense',
    date,
    amount: Math.abs(Number(tx.amount) || 0),
    currency: tx.currency || 'ARS',
    account: tx.account?.name || '',
    category: tx.category?.name || '',
    description: kind === 'transfer' ? '' : desc,
    destinationAccount: tx.destination_account?.name || '',
    amountIncoming: undefined,
    currencyIncoming: undefined,
  };
}

async function resolveUserId(supabase: SupabaseClient): Promise<string> {
  const fromEnv = process.env.COMPARE_USER_ID?.trim();
  if (fromEnv) return fromEnv;

  const { data: users, error: usersErr } = await supabase.from('users').select('id');
  if (usersErr) throw usersErr;
  if (!users?.length) {
    throw new Error('No hay usuarios en `users`. Definí COMPARE_USER_ID o importá datos.');
  }
  if (users.length === 1) return users[0].id;

  let best = '';
  let bestN = 0;
  for (const u of users) {
    const { count, error } = await supabase
      .from('transactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', u.id);
    if (error) throw error;
    const n = count ?? 0;
    if (n > bestN) {
      bestN = n;
      best = u.id;
    }
  }
  if (best) {
    console.log(
      `Usuario para comparación: ${best} (${bestN} movimientos). Definí COMPARE_USER_ID si no es el correcto.`
    );
    return best;
  }

  throw new Error('No se pudo determinar el usuario. Definí COMPARE_USER_ID en el entorno.');
}

async function fetchTransactionsFromSupabase(): Promise<NormalizedRow[]> {
  const root = process.cwd();
  loadEnv({ path: path.join(root, '.env.local') });
  loadEnv({ path: path.join(root, '.env') });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY (revisá .env.local).'
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userId = await resolveUserId(supabase);

  const { data, error } = await supabase
    .from('transactions')
    .select(
      `
      type,
      amount,
      currency,
      transaction_date,
      description,
      notes,
      category:categories(name),
      account:accounts!transactions_account_id_fkey(name, currency),
      destination_account:accounts!transactions_destination_account_id_fkey(name, currency)
    `
    )
    .eq('user_id', userId)
    .order('transaction_date', { ascending: false })
    .limit(10000);

  if (error) throw error;
  return (data ?? []).map((row) =>
    mapDbRowToNormalized(row as unknown as Parameters<typeof mapDbRowToNormalized>[0])
  );
}

function collectFromImportDir(dir: string): NormalizedRow[] {
  const files = fs.readdirSync(dir);
  const all: NormalizedRow[] = [];

  const exp = files.find((f) => /^expenses/i.test(f) && f.endsWith('.csv'));
  const inc = files.find((f) => /^income/i.test(f) && f.endsWith('.csv'));
  const tr = files.find((f) => /^transfers/i.test(f) && f.endsWith('.csv'));

  if (exp) {
    const p = path.join(dir, exp);
    const rows = parseExpensesFile(fs.readFileSync(p, 'utf-8'));
    console.log(`Gastos (${exp}): ${rows.length} filas parseadas`);
    all.push(...rows);
  }
  if (inc) {
    const p = path.join(dir, inc);
    const rows = parseIncomeFile(fs.readFileSync(p, 'utf-8'));
    console.log(`Ingresos (${inc}): ${rows.length} filas parseadas`);
    all.push(...rows);
  }
  if (tr) {
    const p = path.join(dir, tr);
    const rows = parseTransfersFile(fs.readFileSync(p, 'utf-8'));
    console.log(`Transferencias (${tr}): ${rows.length} filas parseadas`);
    all.push(...rows);
  }

  if (!exp && !inc && !tr) {
    console.warn('No se encontraron Expenses-*.csv, Income-*.csv ni Transfers-*.csv en la carpeta.');
  }

  return all;
}

function compareBags(importRows: NormalizedRow[], apiRows: NormalizedRow[]) {
  const byKind = (rows: NormalizedRow[]) => ({
    expense: rows.filter((r) => r.kind === 'expense').length,
    income: rows.filter((r) => r.kind === 'income').length,
    transfer: rows.filter((r) => r.kind === 'transfer').length,
  });

  console.log('\nResumen import (CSV):', byKind(importRows), 'total:', importRows.length);
  console.log('Resumen Zarix (DB o JSON):', byKind(apiRows), 'total:', apiRows.length);

  const bagImport = new Map<string, number>();
  const bagApi = new Map<string, number>();

  for (const r of importRows) addToBag(bagImport, fingerprint(r));
  for (const r of apiRows) addToBag(bagApi, fingerprint(r));

  const onlyImport: string[] = [];
  const onlyApi: string[] = [];

  for (const [k, n] of bagImport) {
    const inApi = bagApi.get(k) ?? 0;
    const diff = n - inApi;
    for (let i = 0; i < diff; i++) onlyImport.push(k);
  }
  for (const [k, n] of bagApi) {
    const inImp = bagImport.get(k) ?? 0;
    const diff = n - inImp;
    for (let i = 0; i < diff; i++) onlyApi.push(k);
  }

  console.log('\n--- Resultado ---');
  console.log('Coincidencias (mismo “fingerprint”):', importRows.length - onlyImport.length);
  console.log('Solo en CSV (import):', onlyImport.length);
  console.log('Solo en Zarix:', onlyApi.length);

  const show = 15;
  if (onlyImport.length) {
    console.log(`\nPrimeros ${Math.min(show, onlyImport.length)} solo en CSV:`);
    onlyImport.slice(0, show).forEach((k) => console.log(' ', k));
  }
  if (onlyApi.length) {
    console.log(`\nPrimeros ${Math.min(show, onlyApi.length)} solo en Zarix:`);
    onlyApi.slice(0, show).forEach((k) => console.log(' ', k));
  }

  if (onlyImport.length === 0 && onlyApi.length === 0) {
    console.log('\n✓ Los conjuntos coinciden por fingerprint (fecha, tipo, montos, cuentas, categoría, descripción).');
  } else {
    console.log(
      '\nNota: diferencias pueden deberse a nombres de cuenta distintos, redondeo, o descripciones editadas en Zarix.'
    );
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--supabase');
  const useSupabase = process.argv.includes('--supabase');
  const importDir = args[0];
  const exportPath = args[1];

  if (!importDir) {
    console.error(
      'Uso: npx tsx scripts/compare-import-with-export.ts <carpeta_import> [--supabase]\n' +
        '     npx tsx scripts/compare-import-with-export.ts <carpeta_import> [zarix-export.json]'
    );
    process.exit(1);
  }

  const resolved = path.resolve(importDir);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    console.error('La carpeta no existe:', resolved);
    process.exit(1);
  }

  const importRows = collectFromImportDir(resolved);

  if (useSupabase) {
    try {
      const apiRows = await fetchTransactionsFromSupabase();
      compareBags(importRows, apiRows);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exit(1);
    }
    return;
  }

  if (!exportPath) {
    const byKind = (rows: NormalizedRow[]) => ({
      expense: rows.filter((r) => r.kind === 'expense').length,
      income: rows.filter((r) => r.kind === 'income').length,
      transfer: rows.filter((r) => r.kind === 'transfer').length,
    });
    console.log('\nResumen import (CSV):', byKind(importRows), 'total:', importRows.length);
    console.log(
      '\nPara comparar con Zarix:\n' +
        '  npx tsx scripts/compare-import-with-export.ts "' +
        importDir +
        '" --supabase\n' +
        '  (usa .env.local) o pasá un JSON de GET /api/export/transactions?format=json\n'
    );
    return;
  }

  const exportFull = path.resolve(exportPath);
  if (!fs.existsSync(exportFull)) {
    console.error('No existe el archivo de export:', exportFull);
    process.exit(1);
  }

  const apiRows = loadExportJson(exportFull);
  compareBags(importRows, apiRows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
