import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClientSync } from '@/lib/supabase/server';

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

type UnresolvedAction = 'none' | 'map' | 'keep_name';

interface UnresolvedResolution {
  action: UnresolvedAction;
  accountId?: string;
}

function parseImportDate(dateStr: string): Date | null {
  const raw = (dateStr || '').trim();
  if (!raw) return null;

  // New import standard: MM-DD-YYYY (also supports MM/DD/YYYY)
  const mdYMatch = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
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

  // Keep ISO compatibility for JSON imports.
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseImportAmount(amountValue: unknown): number | null {
  const raw = String(amountValue ?? '').trim();
  if (!raw) return null;

  // Allow currency symbols/spaces, keep only number punctuation/sign.
  const cleaned = raw.replace(/[^\d.,\-]/g, '');
  if (!cleaned) return null;

  // Import standard: decimal separator must be dot and no thousands separator.
  // Valid examples: 100.00, 1000, -250.75
  // Invalid examples: 1,000.50, 100,00, 1.000,50
  const dotDecimalPattern = /^-?\d+(?:\.\d+)?$/;
  if (!dotDecimalPattern.test(cleaned)) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;

  return Math.abs(parsed);
}

function parseCSV(csvText: string): ImportedTransaction[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
  
  const dateIdx = headers.findIndex(h => ['fecha', 'date'].includes(h));
  const typeIdx = headers.findIndex(h => ['tipo', 'type'].includes(h));
  const amountIdx = headers.findIndex(h => ['monto', 'amount'].includes(h));
  const currencyIdx = headers.findIndex(h => ['moneda', 'currency'].includes(h));
  const accountIdx = headers.findIndex(h => ['cuenta', 'account'].includes(h));
  const categoryIdx = headers.findIndex(h => ['categoría', 'categoria', 'category'].includes(h));
  const descriptionIdx = headers.findIndex(h => ['descripción', 'descripcion', 'description'].includes(h));
  const notesIdx = headers.findIndex(h => ['notas', 'notes'].includes(h));
  
  if (dateIdx === -1 || amountIdx === -1) {
    throw new Error('CSV debe tener columnas "Fecha" y "Monto"');
  }
  
  const transactions: ImportedTransaction[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (const char of line) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const getValue = (idx: number) => idx >= 0 && idx < values.length ? values[idx] : '';
    
    const rawType = getValue(typeIdx).toLowerCase();
    let type: 'expense' | 'income' | 'transfer' = 'expense';
    if (['ingreso', 'income'].includes(rawType)) type = 'income';
    else if (['transferencia', 'transfer'].includes(rawType)) type = 'transfer';
    
    const amount = parseImportAmount(getValue(amountIdx));
    
    if (amount === null || amount === 0) continue;
    
    const parsedDate = parseImportDate(getValue(dateIdx));
    if (!parsedDate) continue;
    
    transactions.push({
      date: parsedDate.toISOString(),
      type,
      amount,
      currency: getValue(currencyIdx) || 'ARS',
      account: getValue(accountIdx) || '',
      category: getValue(categoryIdx) || undefined,
      description: getValue(descriptionIdx) || undefined,
      notes: getValue(notesIdx) || undefined,
    });
  }
  
  return transactions;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

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
    
    let transactions: ImportedTransaction[];
    
    if (file.name.endsWith('.json')) {
      const json = JSON.parse(text);
      if (Array.isArray(json)) {
        transactions = json.map(tx => ({
          date: parseImportDate(tx.date || tx.transaction_date || '')?.toISOString() || new Date().toISOString(),
          type: tx.type || 'expense',
          amount: parseImportAmount(tx.amount) || 0,
          currency: tx.currency || 'ARS',
          account: tx.account || tx.accountName || '',
          category: tx.category || tx.categoryName,
          description: tx.description,
          notes: tx.notes,
        }));
      } else if (json.data?.transactions) {
        transactions = json.data.transactions.map((tx: any) => ({
          date: parseImportDate(tx.transaction_date || '')?.toISOString() || new Date().toISOString(),
          type: tx.type || 'expense',
          amount: parseImportAmount(tx.amount) || 0,
          currency: tx.currency || 'ARS',
          account: '',
          category: undefined,
          description: tx.description,
          notes: tx.notes,
        }));
      } else {
        return NextResponse.json({ error: 'Invalid JSON format' }, { status: 400 });
      }
    } else {
      transactions = parseCSV(text);
    }

    if (transactions.length === 0) {
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
    
    const accountMap = new Map((accounts || []).map(a => [a.name.toLowerCase(), a]));
    const categoryMap = new Map((categories || []).map(c => [c.name.toLowerCase(), c]));

    const unresolvedAccountNames = Array.from(
      new Set(
        transactions
          .map((t) => t.account?.trim())
          .filter((name): name is string => Boolean(name && !accountMap.has(name.toLowerCase())))
      )
    );

    if (mode === 'preview') {
      return NextResponse.json({
        success: true,
        total: transactions.length,
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
    
    for (const tx of transactions) {
      const rawAccountName = (tx.account || '').trim();
      const hasAccountInFile = rawAccountName.length > 0;
      let account = hasAccountInFile ? accountMap.get(rawAccountName.toLowerCase()) : undefined;
      
      let accountId: string | null = null;
      let description = tx.description || null;
      let notes = tx.notes || null;

      if (account) {
        accountId = account.id;
      } else {
        const fallbackByCurrency = Array.from(accountMap.values()).find(a => a.currency === tx.currency);
        const resolution = hasAccountInFile ? (resolutions[rawAccountName] || null) : null;

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
          // Solo autoasignamos por moneda cuando el archivo no trae cuenta.
          accountId = fallbackByCurrency.id;
        } else if (!hasAccountInFile) {
          // Si no hay cuenta en el archivo y no hay fallback por moneda, permitimos sin cuenta.
          accountId = null;
        } else {
          skipped++;
          errors.push(`Cuenta "${rawAccountName}" no resuelta (definí acción en revisión)`); 
          continue;
        }
      }
      
      const category = tx.category ? categoryMap.get(tx.category.toLowerCase()) : null;
      
      try {
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
      total: transactions.length,
      errors: errors.slice(0, 10),
    });

  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Import failed' 
    }, { status: 500 });
  }
}
