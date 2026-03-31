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
    
    const amountStr = getValue(amountIdx).replace(/[^\d.,\-]/g, '').replace(',', '.');
    const amount = Math.abs(parseFloat(amountStr));
    
    if (isNaN(amount) || amount === 0) continue;
    
    let dateStr = getValue(dateIdx);
    let parsedDate: Date;
    
    if (dateStr.includes('/')) {
      const parts = dateStr.split('/');
      if (parts.length === 3) {
        if (parts[2].length === 2) parts[2] = '20' + parts[2];
        parsedDate = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
      } else {
        parsedDate = new Date();
      }
    } else {
      parsedDate = new Date(dateStr);
    }
    
    if (isNaN(parsedDate.getTime())) {
      parsedDate = new Date();
    }
    
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
          date: tx.date || tx.transaction_date || new Date().toISOString(),
          type: tx.type || 'expense',
          amount: Math.abs(parseFloat(tx.amount) || 0),
          currency: tx.currency || 'ARS',
          account: tx.account || tx.accountName || '',
          category: tx.category || tx.categoryName,
          description: tx.description,
          notes: tx.notes,
        }));
      } else if (json.data?.transactions) {
        transactions = json.data.transactions.map((tx: any) => ({
          date: tx.transaction_date || new Date().toISOString(),
          type: tx.type || 'expense',
          amount: Math.abs(parseFloat(tx.amount) || 0),
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
    
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    
    for (const tx of transactions) {
      let account = accountMap.get(tx.account.toLowerCase());
      
      if (!account) {
        account = Array.from(accountMap.values()).find(a => a.currency === tx.currency);
      }
      
      if (!account) {
        skipped++;
        errors.push(`Línea con cuenta "${tx.account}" no encontrada`);
        continue;
      }
      
      const category = tx.category ? categoryMap.get(tx.category.toLowerCase()) : null;
      
      try {
        await serviceSupabase.from('transactions').insert({
          user_id: user.id,
          type: tx.type,
          account_id: account.id,
          amount: tx.amount,
          currency: tx.currency,
          amount_in_account_currency: tx.amount,
          category_id: category?.id || null,
          description: tx.description || null,
          notes: tx.notes || null,
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
