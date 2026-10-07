import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import {
  applyArchivedAccountsTransactionFilter,
  buildToArsConverter,
} from '@/lib/services/transactions';

import { calculateFinancialProjection, projectionWindow } from '@/lib/financial-projections';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date();

    const { startYmd, endExclusive } = projectionWindow(now);

    let txQuery = supabase
      .from('transactions')
      .select('type, amount, currency, amount_in_account_currency, transaction_date')
      .eq('user_id', user.id)
      .in('type', ['expense', 'income'])
      .gte('transaction_date', `${startYmd}T03:00:00.000Z`)
      .lt('transaction_date', `${endExclusive}T03:00:00.000Z`);
    const activeIds = await accountsService.getActiveAccountIds(user.id);
    txQuery = applyArchivedAccountsTransactionFilter(txQuery, activeIds);
    const { data: transactions, error: txErr } = await txQuery;
    if (txErr) {
      console.error('projections query', txErr);
      return NextResponse.json({ error: 'No se pudieron cargar los movimientos.' }, { status: 500 });
    }

    const { toArs, excludedCurrencies } = await buildToArsConverter(transactions || []);
    if (excludedCurrencies.length) {
      return NextResponse.json({
        hasData: false, excludedCurrencies,
        message: `No se puede proyectar sin cotización para ${excludedCurrencies.join(', ')}. Reintentá cuando la referencia esté disponible.`,
      });
    }

    // Projection base is active non-debt cash in ARS, not total multi-currency wealth.
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('balance, currency, is_debt')
      .eq('user_id', user.id)
      .eq('is_active', true);
    if (accountsError) {
      console.error('projections accounts query', accountsError);
      return NextResponse.json({ error: 'No se pudieron cargar los saldos.' }, { status: 500 });
    }

    const currentARS = (accounts || [])
      .filter(a => a.currency === 'ARS' && !a.is_debt)
      .reduce((sum, a) => sum + Number(a.balance), 0);

    return NextResponse.json(calculateFinancialProjection(
      (transactions || []).map(t => ({ type: t.type, amountArs: toArs(t), transaction_date: t.transaction_date })),
      currentARS,
      now
    ));
  } catch (error) {
    console.error('Projections error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
