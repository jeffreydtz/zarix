import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const pageSize = 1000;
    const transactions: Record<string, unknown>[] = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const batch = data || [];
      transactions.push(...batch);
      if (batch.length < pageSize) break;
    }

    const [
      accountsResult,
      categoriesResult,
      budgetsResult,
      investmentsResult,
      userResult,
    ] = await Promise.all([
      supabase.from('accounts').select('*').eq('user_id', user.id),
      supabase.from('categories').select('*').or(`user_id.eq.${user.id},is_system.eq.true`),
      supabase.from('budgets').select('*').eq('user_id', user.id),
      supabase.from('investments').select('*').eq('user_id', user.id),
      supabase.from('users').select('default_currency, timezone').eq('id', user.id).single(),
    ]);

    // A failed dataset is not an empty dataset: never offer an incomplete backup as valid.
    for (const result of [accountsResult, categoriesResult, budgetsResult, investmentsResult, userResult]) {
      if (result.error) throw result.error;
    }

    const backup = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      app: 'Zarix',
      user: {
        id: user.id,
        email: user.email,
        defaultCurrency: userResult.data?.default_currency || 'ARS',
        timezone: userResult.data?.timezone || 'America/Argentina/Buenos_Aires',
      },
      data: {
        accounts: accountsResult.data || [],
        transactions,
        categories: (categoriesResult.data || []).filter(c => c.user_id === user.id),
        budgets: budgetsResult.data || [],
        investments: investmentsResult.data || [],
      },
      stats: {
        accountsCount: accountsResult.data?.length || 0,
        transactionsCount: transactions.length,
        categoriesCount: (categoriesResult.data || []).filter(c => c.user_id === user.id).length,
        budgetsCount: budgetsResult.data?.length || 0,
        investmentsCount: investmentsResult.data?.length || 0,
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
