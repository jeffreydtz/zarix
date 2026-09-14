import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { errorResponse } from '@/lib/api-handler';
import { checkExportDeadline, collectExportRows, createExportBudget, EXPORT_PAGE_SIZE } from '@/lib/export-pagination';

export const maxDuration = 60;

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const budget = createExportBudget();
    const readTable = (table: string) => collectExportRows<{ id: string; [key: string]: unknown }>((after, signal) => {
      let query = supabase.from(table).select('*').eq('user_id', user.id)
        .order('id', { ascending: true }).limit(EXPORT_PAGE_SIZE).abortSignal(signal);
      if (after) query = query.gt('id', after);
      return query;
    }, budget);
    // Sequential datasets keep peak in-flight payloads bounded by one page.
    const accounts = await readTable('accounts');
    const transactions = await readTable('transactions');
    const categories = await readTable('categories');
    const budgets = await readTable('budgets');
    const investments = await readTable('investments');
    const userResult = await supabase.from('users').select('default_currency, timezone')
      .eq('id', user.id).abortSignal(budget.signal).single();
    checkExportDeadline(budget.signal);
    if (userResult.error) throw userResult.error;

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
        accounts: accounts,
        transactions,
        categories: categories,
        budgets: budgets,
        investments: investments,
      },
      stats: {
        accountsCount: accounts.length,
        transactionsCount: transactions.length,
        categoriesCount: categories.length,
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
    return errorResponse(error);
  }
}
