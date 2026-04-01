import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClientSync } from '@/lib/supabase/server';
import { transactionsService } from '@/lib/services/transactions';

interface ImportedTransaction {
  date: string;
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  currency: string;
  account: string;
  category?: string;
  description?: string;
  notes?: string;
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

function findColumnIndex(headers: string[], matchers: RegExp[]): number {
  const normalized = headers.map(normalizeHeader);
  for (let i = 0; i < normalized.length; i++) {
    const h = normalized[i];
    if (matchers.some((re) => re.test(h))) return i;
  }
  return -1;
}

function parseImportDate(dateStr: string): Date | null {
  const raw = (dateStr || '').trim();
  if (!raw) return null;

  const isoTry = new Date(raw);
  if (!Number.isNaN(isoTry.getTime())) return isoTry;

  const datePart = raw.split(/\s+/)[0] ?? raw;

  const mdYMatch = datePart.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (mdYMatch) {
    const month = Number(mdYMatch[1]);
    const day = Number(mdYMatch[2]);
    const yearRaw = Number(mdYMatch[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const parsed = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
  }

  const parsed = new Date(datePart);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseImportAmount(amountValue: unknown): number | null {
  const raw = String(amountValue ?? '').trim();
  if (!raw) return null;

  const cleaned = raw.replace(/[^\d.,\-]/g, '');
  if (!cleaned) return null;

  const dotDecimalPattern = /^-?\d+(?:\.\d+)?$/;
  if (!dotDecimalPattern.test(cleaned)) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;

  return Math.abs(parsed);
}

function parseStandardCSV(headers: string[], rows: string[][]): ImportedTransaction[] {
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

    const parsedDate = parseImportDate(getValue(row, dateIdx));
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

function tryParseTransferCSV(headers: string[], rows: string[][]): ImportedTransferRow[] | null {
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

    const parsedDate = parseImportDate(getValue(row, dateIdx));
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

function parseCSVUnified(text: string):
  | { kind: 'standard'; transactions: ImportedTransaction[] }
  | { kind: 'transfer'; transfers: ImportedTransferRow[] } {
  const { headers, rows } = parseCSVFile(text);
  if (headers.length === 0) {
    return { kind: 'standard', transactions: [] };
  }

  const transferRows = tryParseTransferCSV(headers, rows);
  if (transferRows !== null) {
    return { kind: 'transfer', transfers: transferRows };
  }

  return { kind: 'standard', transactions: parseStandardCSV(headers, rows) };
}

function collectUnresolvedAccountNames(
  accountMap: Map<string, { id: string; name: string; currency: string }>,
  transactions: ImportedTransaction[]
): string[] {
  return Array.from(
    new Set(
      transactions
        .map((t) => t.account?.trim())
        .filter((name): name is string => Boolean(name && !accountMap.has(name.toLowerCase())))
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
    if (o && !accountMap.has(o.toLowerCase())) names.add(o);
    if (i && !accountMap.has(i.toLowerCase())) names.add(i);
  }
  return Array.from(names);
}

function resolveAccountId(
  rawName: string,
  accountMap: Map<string, { id: string; name: string; currency: string }>,
  resolutions: Record<string, UnresolvedResolution>,
  currency: string,
  allowCurrencyFallback = true
): { accountId: string | null; notesAppend: string | null; skipReason: string | null } {
  const trimmed = rawName.trim();
  if (!trimmed) {
    return { accountId: null, notesAppend: null, skipReason: 'Sin nombre de cuenta' };
  }

  const found = accountMap.get(trimmed.toLowerCase());
  if (found) {
    return { accountId: found.id, notesAppend: null, skipReason: null };
  }

  const resolution = resolutions[trimmed] || null;
  const fallbackByCurrency = Array.from(accountMap.values()).find((a) => a.currency === currency);

  if (resolution?.action === 'map' && resolution.accountId) {
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

    const text = await file.text();

    let parsed:
      | { kind: 'standard'; transactions: ImportedTransaction[] }
      | { kind: 'transfer'; transfers: ImportedTransferRow[] };

    if (file.name.endsWith('.json')) {
      const json = JSON.parse(text);
      if (Array.isArray(json)) {
        parsed = {
          kind: 'standard',
          transactions: json.map((tx: any) => ({
            date:
              parseImportDate(tx.date || tx.transaction_date || '')?.toISOString() ||
              new Date().toISOString(),
            type: tx.type || 'expense',
            amount: parseImportAmount(tx.amount) || 0,
            currency: tx.currency || 'ARS',
            account: tx.account || tx.accountName || '',
            category: tx.category || tx.categoryName,
            description: tx.description,
            notes: tx.notes,
          })),
        };
      } else if (json.data?.transactions) {
        parsed = {
          kind: 'standard',
          transactions: json.data.transactions.map((tx: any) => ({
            date:
              parseImportDate(tx.transaction_date || '')?.toISOString() ||
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
    } else {
      parsed = parseCSVUnified(text);
    }

    const totalCount =
      parsed.kind === 'transfer' ? parsed.transfers.length : parsed.transactions.length;

    if (totalCount === 0) {
      return NextResponse.json({ error: 'No transactions found in file' }, { status: 400 });
    }

    const serviceSupabase = createServiceClientSync();

    const { data: accounts } = await serviceSupabase
      .from('accounts')
      .select('id, name, currency')
      .eq('user_id', user.id);

    const { data: categories } = await serviceSupabase
      .from('categories')
      .select('id, name')
      .or(`user_id.eq.${user.id},is_system.eq.true`);

    const accountMap = new Map((accounts || []).map((a) => [a.name.toLowerCase(), a]));
    const categoryMap = new Map((categories || []).map((c) => [c.name.toLowerCase(), c]));

    const unresolvedAccountNames =
      parsed.kind === 'transfer'
        ? collectUnresolvedForTransfers(accountMap, parsed.transfers)
        : collectUnresolvedAccountNames(accountMap, parsed.transactions);

    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        total: totalCount,
        importKind: parsed.kind,
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
    const errors: string[] = [];

    if (parsed.kind === 'transfer') {
      for (const tr of parsed.transfers) {
        const outRes = resolveAccountId(
          tr.outgoingName,
          accountMap,
          resolutions,
          tr.currencyOutgoing,
          false
        );
        const inRes = resolveAccountId(
          tr.incomingName,
          accountMap,
          resolutions,
          tr.currencyIncoming || tr.currencyOutgoing,
          false
        );

        if (outRes.skipReason || !outRes.accountId) {
          skipped++;
          errors.push(
            `Transferencia: origen "${tr.outgoingName}" — ${outRes.skipReason || 'sin cuenta'}`
          );
          continue;
        }
        if (inRes.skipReason || !inRes.accountId) {
          skipped++;
          errors.push(
            `Transferencia: destino "${tr.incomingName}" — ${inRes.skipReason || 'sin cuenta'}`
          );
          continue;
        }

        if (outRes.accountId === inRes.accountId) {
          skipped++;
          errors.push(`Transferencia: origen y destino son la misma cuenta`);
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
        } catch (e: any) {
          skipped++;
          errors.push(
            `Error transferencia ${tr.outgoingName}→${tr.incomingName}: ${e?.message || e}`
          );
        }
      }

      return NextResponse.json({
        success: true,
        imported,
        skipped,
        total: totalCount,
        importKind: 'transfer',
        errors: errors.slice(0, 10),
      });
    }

    for (const tx of parsed.transactions) {
      const rawAccountName = (tx.account || '').trim();
      const hasAccountInFile = rawAccountName.length > 0;
      let account = hasAccountInFile ? accountMap.get(rawAccountName.toLowerCase()) : undefined;

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
          skipped++;
          errors.push(`Cuenta "${rawAccountName}" no resuelta (definí acción en revisión)`);
          continue;
        }
      }

      const category = tx.category ? categoryMap.get(tx.category.toLowerCase()) : null;

      try {
        if (tx.type === 'transfer') {
          skipped++;
          errors.push(
            'Las transferencias entre cuentas usá el CSV de transferencias (Origen/Destino).'
          );
          continue;
        }

        await serviceSupabase.from('transactions').insert({
          user_id: user.id,
          type: tx.type,
          account_id: accountId,
          amount: tx.amount,
          currency: tx.currency,
          amount_in_account_currency: tx.amount,
          category_id: category?.id || null,
          description,
          notes,
          transaction_date: tx.date,
        });

        imported++;
      } catch (e) {
        skipped++;
        errors.push(`Error importando transacción: ${tx.description || tx.amount}`);
      }
    }

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      total: totalCount,
      importKind: 'standard',
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Import failed',
    }, { status: 500 });
  }
}
