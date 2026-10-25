import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import AccountsList from '@/components/accounts/AccountsList';
import ArchivedAccountsPanel from '@/components/accounts/ArchivedAccountsPanel';
import CreateAccountButton from '@/components/accounts/CreateAccountButton';
import CreateTransactionButton from '@/components/expenses/CreateTransactionButton';
import FxUnavailableBanner from '@/components/ui/FxUnavailableBanner';

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
      accountsService.list(user.id, { allowPartialValuation: true }).catch(() => []),
      accountsService.listArchived(user.id).catch(() => []),
    ]);
    const aggregates =
      accounts.length > 0 ? accountsService.aggregateAccountTotals(accounts) : null;
    const fxAsOf = accounts.find((account) => account.valuation?.asOf)?.valuation?.asOf ?? null;
    const fxUnavailable = Boolean(
      aggregates?.valuation?.status === 'fx_unavailable'
      || accounts.some((account) => account.valuation?.fxUnavailable)
    );

    return (
      <div className="min-h-screen bg-background transition-colors duration-300">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {fxUnavailable ? <FxUnavailableBanner asOf={fxAsOf} /> : null}
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
