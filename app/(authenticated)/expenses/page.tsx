import FxStatusBanner, { combinedFxStatus } from '@/components/ui/FxStatusBanner';
import { redirect, unstable_rethrow } from 'next/navigation';
import { getCachedUser } from '@/lib/auth/session';
import FinancialDataError from '@/components/ui/FinancialDataError';
import { createClient } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import { transactionsService } from '@/lib/services/transactions';
import TransactionsList from '@/components/expenses/TransactionsList';
import TransactionsFilters from '@/components/expenses/TransactionsFilters';
import CreateTransactionButton from '@/components/expenses/CreateTransactionButton';
import { PageHero, PageScaffold } from '@/components/ui/PageScaffold';

export default async function ExpensesPage(
  props: {
    searchParams: Promise<{ [key: string]: string | undefined }>;
  }
) {
  const searchParams = await props.searchParams;
  try {
    const supabase = await createClient();
    const user = await getCachedUser();

    if (!user) {
      redirect('/login');
    }

    const [accounts, categoriesRes, transactions] = await Promise.all([
      accountsService.list(user.id),
      supabase
        .from('categories')
        .select('*')
        .or(`user_id.eq.${user.id},is_system.eq.true`),
      transactionsService
        .list(user.id, {
          accountId: searchParams.accountId,
          categoryId: searchParams.categoryId,
          type: searchParams.type,
          startDate: searchParams.startDate,
          endDate: searchParams.endDate,
          search: searchParams.search,
          minAmount: searchParams.minAmount ? parseFloat(searchParams.minAmount) : undefined,
          maxAmount: searchParams.maxAmount ? parseFloat(searchParams.maxAmount) : undefined,
          limit: 2000,
        }),
    ]);
    if (categoriesRes.error) throw categoriesRes.error;
    const categories = categoriesRes.data;
    const currencies = [...new Set([
      ...transactions.map(transaction => transaction.currency),
      ...accounts.flatMap(account => account.is_multicurrency && account.secondary_currency
        ? [account.currency, account.secondary_currency] : [account.currency]),
    ])];
    const fx = await cotizacionesService.getTransactionsFxRates(currencies);

    return (
      <PageScaffold
        hero={
          <PageHero
            title="Movimientos"
            subtitle="Tocá un movimiento para editarlo"
            rightSlot={<CreateTransactionButton />}
          />
        }
      >
        <FxStatusBanner {...combinedFxStatus([...accounts, { fxUnavailable: !fx || fx.fxUnavailable, fxStale: fx?.stale, fxAsOf: fx?.asOf?.toISOString() }])} />
        <div className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground -mt-2">
          Traídos: {transactions.length}
        </div>
        <TransactionsFilters accounts={accounts || []} categories={categories || []} />
        <TransactionsList
          transactions={transactions}
          accounts={accounts || []}
          categories={categories || []}
        />
      </PageScaffold>
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error('[expenses] Financial data unavailable');
    return <FinancialDataError retryHref="/expenses" />;
  }
}
