import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import {
  applyArchivedAccountsTransactionFilter,
  buildToArsConverter,
  excludedCurrenciesNote,
} from '@/lib/services/transactions';
import { anomalyWindow, calculateFinancialAnomalies } from '@/lib/financial-anomalies';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date();
    const { startIso, endExclusiveIso } = anomalyWindow(now);
    let txQ = supabase
      .from('transactions')
      .select('type, amount, currency, amount_in_account_currency, category_id, transaction_date, category:categories(name, icon)')
      .eq('user_id', user.id)
      .eq('type', 'expense')
      .gte('transaction_date', startIso)
      .lt('transaction_date', endExclusiveIso);
    const activeIds = await accountsService.getActiveAccountIds(user.id);
    txQ = applyArchivedAccountsTransactionFilter(txQ, activeIds);
    const { data: transactions, error: txErr } = await txQ;
    if (txErr) {
      console.error('anomalies query', txErr);
      return NextResponse.json({ error: 'No se pudieron cargar los movimientos.' }, { status: 500 });
    }

    const { toArs, excludedCurrencies } = await buildToArsConverter(transactions || []);
    const anomalies = calculateFinancialAnomalies((transactions || []).map(t => ({
      type: t.type,
      amountArs: toArs(t),
      category_id: t.category_id,
      category: Array.isArray(t.category) ? t.category[0] ?? null : t.category,
      transaction_date: t.transaction_date,
    })), now);
    return NextResponse.json({
      anomalies,
      partial: excludedCurrencies.length > 0,
      excludedCurrencies,
      message: excludedCurrenciesNote(excludedCurrencies),
    });
  } catch (error) {
    console.error('Anomalies error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
