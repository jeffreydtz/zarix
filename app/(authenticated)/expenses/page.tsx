import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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

    const { data: accounts } = await supabase
      .from('accounts')
      .select('id, name, currency')
      .eq('user_id', user.id)
      .eq('is_active', true);

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
      })
      .catch(() => []);

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto p-4 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold">Movimientos</h1>
            <CreateTransactionButton accounts={accounts || []} categories={categories || []} />
          </div>

          <TransactionsFilters accounts={accounts || []} categories={categories || []} />

          <TransactionsList transactions={transactions} />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Expenses page error:', error);
    redirect('/login');
  }
}
