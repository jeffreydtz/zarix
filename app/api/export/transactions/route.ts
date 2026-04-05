import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transactionsService } from '@/lib/services/transactions';

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

    const transactions = await transactionsService.list(user.id, {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      accountId: accountId || undefined,
      categoryId: categoryId || undefined,
      type: type || undefined,
      limit: 10000,
    });

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
      const date = new Date(tx.transaction_date).toLocaleDateString('es-AR');
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
        (tx.description || '').replace(/"/g, '""'),
        (tx.notes || '').replace(/"/g, '""'),
        installment,
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    const BOM = '\uFEFF';

    return new NextResponse(BOM + csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="zarix-transactions-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });

  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}
