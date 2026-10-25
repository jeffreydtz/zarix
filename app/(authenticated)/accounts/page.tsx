import FxStatusBanner, { combinedFxStatus } from '@/components/ui/FxStatusBanner';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getCachedUser } from '@/lib/auth/session';
import FinancialDataError from '@/components/ui/FinancialDataError';
import { accountsService } from '@/lib/services/accounts';
import AccountsList from '@/components/accounts/AccountsList';
import ArchivedAccountsPanel from '@/components/accounts/ArchivedAccountsPanel';
import CreateAccountButton from '@/components/accounts/CreateAccountButton';
import CreateTransactionButton from '@/components/expenses/CreateTransactionButton';

export default async function AccountsPage() {
  try {
    const user = await getCachedUser();

    if (!user) {
      redirect('/login');
    }

    const [accounts, archivedAccounts] = await Promise.all([
      accountsService.list(user.id, { allowPartialValuation: true }),
      accountsService.listArchived(user.id),
    ]);
    const aggregates =
      accounts.length > 0 ? accountsService.aggregateAccountTotals(accounts) : null;

    return (
      <div className="min-h-screen bg-background transition-colors duration-300">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Cuentas</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Administra tus cuentas y tarjetas
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <CreateTransactionButton mode="transfer-only" triggerClassName="btn btn-secondary" />
              <CreateAccountButton />
            </div>
          </div>

          <FxStatusBanner {...combinedFxStatus(accounts)} />
          <AccountsList accounts={accounts} aggregates={aggregates} />
          <ArchivedAccountsPanel accounts={archivedAccounts} />
        </div>
      </div>
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error('[accounts] Financial data unavailable');
    return <FinancialDataError retryHref="/accounts" />;
  }
}
