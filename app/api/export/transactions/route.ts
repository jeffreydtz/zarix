import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { TransactionWithCategory } from '@/lib/services/transactions';
import { ApiError, errorResponse } from '@/lib/api-handler';
import { collectExportRows, createExportBudget, EXPORT_PAGE_SIZE } from '@/lib/export-pagination';
import { encodeCsvCell } from '@/lib/csv';

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const format = searchParams.get('format') || 'csv';
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const accountId = searchParams.get('accountId');
    const categoryId = searchParams.get('categoryId');
    const type = searchParams.get('type');

    for (const date of [startDate, endDate]) {
      if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
        throw new ApiError('Las fechas deben ser válidas y tener formato AAAA-MM-DD.', 400);
      }
    }
    if (startDate && endDate && startDate > endDate) throw new ApiError('La fecha inicial debe ser anterior o igual a la final.', 400);
    const endExclusive = endDate ? new Date(Date.parse(endDate) + 86_400_000).toISOString() : null;

    const transactions = await collectExportRows<TransactionWithCategory>((after, signal) => {
      let query = supabase.from('transactions').select(`*,
        category:categories(name, icon),
        account:accounts!transactions_account_id_fkey(name, currency),
        destination_account:accounts!transactions_destination_account_id_fkey(name, currency)
      `).eq('user_id', user.id).order('id', { ascending: true })
        .limit(EXPORT_PAGE_SIZE).abortSignal(signal);
      if (after) query = query.gt('id', after);
      if (startDate) query = query.gte('transaction_date', startDate);
      if (endExclusive) query = query.lt('transaction_date', endExclusive);
      if (accountId) query = query.eq('account_id', accountId);
      if (categoryId === 'uncategorized') query = query.is('category_id', null);
      else if (categoryId) query = query.eq('category_id', categoryId);
      if (type) query = query.eq('type', type);
      return query;
    }, createExportBudget());
    // Downloads include archived-account history. Keep presentation date-descending.
    transactions.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.id.localeCompare(a.id));

    if (format === 'json') {
      const jsonData = transactions.map(tx => ({
        id: tx.id,
        type: tx.type,
        amount: tx.amount,
        currency: tx.currency,
        amountInAccountCurrency: tx.amount_in_account_currency,
        exchangeRate: tx.exchange_rate,
        account: tx.account?.name || '',
        destinationAccount: tx.destination_account?.name || '',
        category: tx.category?.name || '',
        description: tx.description || '',
        notes: tx.notes || '',
        date: tx.transaction_date,
        isRecurring: tx.is_recurring,
        installmentNumber: tx.installment_number,
        installmentTotal: tx.installment_total,
      }));

      return new NextResponse(JSON.stringify(jsonData, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="zarix-transactions-${new Date().toISOString().split('T')[0]}.json"`,
        },
      });
    }

    const headers = [
      'Fecha',
      'Tipo',
      'Monto',
      'Moneda',
      'Monto en Cuenta',
      'Cuenta',
      'Categoría',
      'Descripción',
      'Notas',
      'Cuota',
    ];

    const rows = transactions.map(tx => {
      const date = new Date(tx.transaction_date).toLocaleDateString('es-AR', { timeZone: 'UTC' });
      const typeLabels: Record<string, string> = {
        expense: 'Gasto',
        income: 'Ingreso',
        transfer: 'Transferencia',
        adjustment: 'Ajuste',
      };
      
      const installment = tx.installment_number && tx.installment_total
        ? `${tx.installment_number}/${tx.installment_total}`
        : '';

      return [
        date,
        typeLabels[tx.type] || tx.type,
        tx.amount.toString(),
        tx.currency,
        tx.amount_in_account_currency.toString(),
        tx.account?.name || '',
        tx.category?.name || '',
        tx.description || '',
        tx.notes || '',
        installment,
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(encodeCsvCell).join(',')),
    ].join('\n');

    const BOM = '\uFEFF';

    return new NextResponse(BOM + csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="zarix-transactions-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

  } catch (error) {
    return errorResponse(error);
  }
}
