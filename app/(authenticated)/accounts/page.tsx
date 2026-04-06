import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import AccountsList from '@/components/accounts/AccountsList';
import ArchivedAccountsPanel from '@/components/accounts/ArchivedAccountsPanel';
import CreateAccountButton from '@/components/accounts/CreateAccountButton';
import CreateTransactionButton from '@/components/expenses/CreateTransactionButton';

export default async function AccountsPage() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect('/login');
    }

    const [accounts, archivedAccounts] = await Promise.all([
      accountsService.list(user.id).catch(() => []),
      accountsService.listArchived(user.id).catch(() => []),
    ]);
    const aggregates =
      accounts.length > 0 ? accountsService.aggregateAccountTotals(accounts) : null;

    const { data: categories } = await supabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${user.id},is_system.eq.true`);

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">Cuentas</h1>
              <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                Administra tus cuentas y tarjetas
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <CreateTransactionButton
                accounts={accounts}
                categories={categories || []}
                mode="transfer-only"
                triggerClassName="btn btn-secondary"
              />
              <CreateAccountButton />
            </div>
          </div>

          <AccountsList accounts={accounts} aggregates={aggregates} />
          <ArchivedAccountsPanel accounts={archivedAccounts} />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Accounts page error:', error);
    redirect('/login');
  }
}
