import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Stable ordering + pagination for every table, not only transactions.
    const pageSize = 1000;
    const readTable = async (table: string, systemCategories = false) => {
      const rows: Record<string, unknown>[] = [];
      for (let from = 0; ; from += pageSize) {
        let query = supabase.from(table).select('*');
        query = systemCategories
          ? query.or(`user_id.eq.${user.id},is_system.eq.true`)
          : query.eq('user_id', user.id);
        const { data, error } = await query.order('id').range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = data || [];
        rows.push(...batch);
        if (batch.length < pageSize) return rows;
      }
    };
    const [accounts, transactions, categories, budgets, investments, userResult] = await Promise.all([
      readTable('accounts'), readTable('transactions'), readTable('categories', true),
      readTable('budgets'), readTable('investments'),
      supabase.from('users').select('default_currency, timezone').eq('id', user.id).single(),
    ]);
    if (userResult.error) throw userResult.error;

    const backup = {
      version: '1.1',
      scope: 'personal-data-export',
      recoveryCoverage: { schema: false, auth: false, storage: false, completeSystem: false },
      consistency: 'Per-table paginated reads; not a transactionally consistent database snapshot',
      exportedAt: new Date().toISOString(),
      app: 'Zarix',
      user: {
        id: user.id,
        email: user.email,
        defaultCurrency: userResult.data?.default_currency || 'ARS',
        timezone: userResult.data?.timezone || 'America/Argentina/Buenos_Aires',
      },
      data: {
        accounts,
        transactions,
        // System category names are needed to reconstruct category references.
        // The query still permits only this user's categories or public system ones.
        categories,
        budgets,
        investments,
      },
      stats: {
        accountsCount: accounts.length,
        transactionsCount: transactions.length,
        categoriesCount: categories.filter(c => c.user_id === user.id).length,
        budgetsCount: budgets.length,
        investmentsCount: investments.length,
      },
    };

    return new NextResponse(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="zarix-backup-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });

  } catch (error) {
    console.error('Backup error:', error);
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 });
  }
}
