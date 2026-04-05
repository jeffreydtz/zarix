import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import { transactionsService } from '@/lib/services/transactions';
import TransactionsList from '@/components/expenses/TransactionsList';
import TransactionsFilters from '@/components/expenses/TransactionsFilters';
import CreateTransactionButton from '@/components/expenses/CreateTransactionButton';

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | undefined };
}) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect('/login');
    }

    const accounts = await accountsService.list(user.id).catch(() => []);

    const { data: categories } = await supabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${user.id},is_system.eq.true`);

    const transactions = await transactionsService
      .list(user.id, {
        accountId: searchParams.accountId,
        categoryId: searchParams.categoryId,
        type: searchParams.type,
        startDate: searchParams.startDate,
        endDate: searchParams.endDate,
        search: searchParams.search,
        minAmount: searchParams.minAmount ? parseFloat(searchParams.minAmount) : undefined,
        maxAmount: searchParams.maxAmount ? parseFloat(searchParams.maxAmount) : undefined,
      })
      .catch(() => []);


    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Movimientos</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                Toca un movimiento para editarlo
              </p>
              <div className="mt-2 inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                Traídos: {transactions.length}
              </div>
            </div>
            <CreateTransactionButton accounts={accounts || []} categories={categories || []} />
          </div>

          <TransactionsFilters accounts={accounts || []} categories={categories || []} />

          <TransactionsList 
            transactions={transactions} 
            accounts={accounts || []}
            categories={categories || []}
          />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Expenses page error:', error);
    redirect('/login');
  }
}
