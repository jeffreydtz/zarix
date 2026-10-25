import FxStatusBanner, { combinedFxStatus } from '@/components/ui/FxStatusBanner';
import { redirect } from 'next/navigation';
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
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect('/login');
    }

    const [accounts, categoriesRes, transactions, fx] = await Promise.all([
      accountsService.list(user.id).catch(() => []),
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
        })
        .catch(() => []),
      cotizacionesService.getTransactionsFxRates().catch(() => null),
    ]);
    const categories = categoriesRes.data;


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
    console.error('Expenses page error:', error);
    redirect('/login');
  }
}
