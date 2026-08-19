import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import {
  applyArchivedAccountsTransactionFilter,
  buildToArsConverter,
} from '@/lib/services/transactions';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const now = new Date();

    // Get 4 months of expense data
    const fourMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    let txQ = supabase
      .from('transactions')
      .select('amount, currency, amount_in_account_currency, category_id, transaction_date, category:categories(name, icon)')
      .eq('user_id', user.id)
      .eq('type', 'expense')
      .gte('transaction_date', fourMonthsAgo.toISOString());
    const activeIds = await accountsService.getActiveAccountIds(user.id);
    txQ = applyArchivedAccountsTransactionFilter(txQ, activeIds);
    const { data: transactions, error: txErr } = await txQ;
    if (txErr) {
      console.error('anomalies query', txErr);
      return NextResponse.json({ error: 'No se pudieron cargar los movimientos.' }, { status: 500 });
    }

    if (!transactions || transactions.length === 0) {
      return NextResponse.json({ anomalies: [] });
    }
    const { toArs } = await buildToArsConverter(transactions);

    // Split into historical (3 prev months) and current month
    const historical = transactions.filter(
      (t) => new Date(t.transaction_date) < startOfCurrentMonth
    );
    const currentMonth = transactions.filter(
      (t) => new Date(t.transaction_date) >= startOfCurrentMonth
    );

    // Calculate average per category over historical months
    const historicalByCategory: Record<string, { name: string; icon: string; total: number; count: number }> = {};
    for (const t of historical) {
      const cat = t.category as any;
      const catId = t.category_id || 'uncategorized';
      if (!historicalByCategory[catId]) {
        historicalByCategory[catId] = {
          name: cat?.name || 'Sin categoría',
          icon: cat?.icon || '🔁',
          total: 0,
          count: 0,
        };
      }
      historicalByCategory[catId].total += toArs(t);
      historicalByCategory[catId].count += 1;
    }

    // Monthly average per category (over 3 months)
    const monthlyAvg: Record<string, number> = {};
    for (const [catId, data] of Object.entries(historicalByCategory)) {
      monthlyAvg[catId] = data.total / 3; // 3 months of history
    }

    // Current month by category
    const currentByCategory: Record<string, { name: string; icon: string; total: number }> = {};
    for (const t of currentMonth) {
      const cat = t.category as any;
      const catId = t.category_id || 'uncategorized';
      if (!currentByCategory[catId]) {
        currentByCategory[catId] = {
          name: cat?.name || 'Sin categoría',
          icon: cat?.icon || '🔁',
          total: 0,
        };
      }
      currentByCategory[catId].total += toArs(t);
    }

    // Detect anomalies: current > 2x historical average
    const anomalies = [];
    for (const [catId, current] of Object.entries(currentByCategory)) {
      const avg = monthlyAvg[catId];
      if (avg && avg > 0) {
        const ratio = current.total / avg;
        if (ratio >= 2) {
          anomalies.push({
            categoryId: catId,
            categoryName: current.name,
            categoryIcon: current.icon,
            currentAmount: current.total,
            historicalAvg: avg,
            ratio: ratio,
            extraAmount: current.total - avg,
          });
        }
      } else if (!avg && current.total > 5000) {
        // New category with significant spending
        anomalies.push({
          categoryId: catId,
          categoryName: current.name,
          categoryIcon: current.icon,
          currentAmount: current.total,
          historicalAvg: 0,
          ratio: null, // new category
          extraAmount: current.total,
        });
      }
    }

    // Sort by ratio descending
    anomalies.sort((a, b) => (b.ratio || 99) - (a.ratio || 99));

    return NextResponse.json({ anomalies });
  } catch (error) {
    console.error('Anomalies error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
