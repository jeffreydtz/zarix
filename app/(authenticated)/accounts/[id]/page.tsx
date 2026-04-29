import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AccountBalanceEquivalents from '@/components/accounts/AccountBalanceEquivalents';
import CorrectDebtBalanceSign from '@/components/accounts/CorrectDebtBalanceSign';
import RepairCurrencyRangePanel from '@/components/accounts/RepairCurrencyRangePanel';
import { accountsService } from '@/lib/services/accounts';
import type { AccountWithBalance } from '@/lib/services/accounts';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import { transactionsService } from '@/lib/services/transactions';
import TransactionsList from '@/components/expenses/TransactionsList';
import CreateTransactionButton from '@/components/expenses/CreateTransactionButton';
import ReconcileBalanceButton from '@/components/accounts/ReconcileBalanceButton';
import { getAccountDisplayName, getAccountTypeLabelEs } from '@/lib/account-display-name';

export default async function AccountDetailPage({ params }: { params: { id: string } }) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect('/login');
    }

    const account = await accountsService.getById(params.id, user.id).catch(() => null);
    if (!account) {
      notFound();
    }

    const [accounts, transactions, categoriesResult, fxRates] = await Promise.all([
      accountsService.list(user.id).catch(() => []),
      transactionsService
        .list(user.id, { involveAccountId: account.id, limit: 500 })
        .catch(() => []),
      supabase
        .from('categories')
        .select('*')
        .or(`user_id.eq.${user.id},is_system.eq.true`),
      cotizacionesService.getTransactionsFxRates().catch(() => null),
    ]);

    const categories = categoriesResult.data || [];

    const balance = Number(account.balance);
    const typeLabel = getAccountTypeLabelEs(account.type);
    const enriched = accounts.find((a) => a.id === account.id) as AccountWithBalance | undefined;
    const isMulticurrencyCard =
      account.type === 'credit_card' &&
      account.is_multicurrency &&
      typeof enriched?.multicurrency_balance_primary === 'number' &&
      typeof enriched?.multicurrency_balance_secondary === 'number';

    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link
                href="/accounts"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-block"
              >
                ← Volver a cuentas
              </Link>
              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className="text-4xl w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm"
                  style={{ backgroundColor: `${account.color || '#3B82F6'}25` }}
                >
                  {account.icon || '💳'}
                </span>
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100">
                    {getAccountDisplayName(account)}
                  </h1>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">
                    {typeLabel} · {account.currency}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-0.5">
                  Saldo actual
                </p>
                {isMulticurrencyCard ? (
                  <div className="space-y-1">
                    <p className="text-3xl font-bold tabular-nums text-red-500">
                      -$
                      {Math.abs(Number(enriched.multicurrency_balance_primary)).toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      <span className="text-lg font-medium text-slate-500">{account.currency}</span>
                    </p>
                    <p className="text-3xl font-bold tabular-nums text-red-500">
                      -$
                      {Math.abs(Number(enriched.multicurrency_balance_secondary)).toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      <span className="text-lg font-medium text-slate-500">
                        {account.secondary_currency}
                      </span>
                    </p>
                  </div>
                ) : (
                  <p
                    className={`text-3xl font-bold tabular-nums ${
                      account.is_debt ? 'text-red-500' : 'text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {account.is_debt ? '-' : ''}$
                    {(account.is_debt ? Math.abs(balance) : balance).toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    <span className="text-lg font-medium text-slate-500">{account.currency}</span>
                  </p>
                )}
                {enriched && Math.abs(balance) > 1e-8 && (
                  <div className="mt-1">
                    <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-0.5">
                      Referencia en otras monedas
                    </p>
                    <AccountBalanceEquivalents account={enriched} variant="detail" />
                  </div>
                )}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-3 max-w-xl">
                Incluye gastos, ingresos y transferencias donde esta cuenta es origen o destino.
              </p>
              <div className="mt-4 max-w-xl flex flex-col gap-2">
                <CorrectDebtBalanceSign
                  accountId={account.id}
                  balance={balance}
                  isDebt={account.is_debt}
                  accountType={account.type}
                />
                <ReconcileBalanceButton accountId={account.id} />
              </div>
            </div>
            <CreateTransactionButton accounts={accounts} categories={categories} />
          </div>

          <RepairCurrencyRangePanel accountId={account.id} />

          <TransactionsList
            transactions={transactions}
            accounts={accounts}
            categories={categories}
            emptySubmessage="No hay movimientos que involucren esta cuenta. Podés cargar uno desde el botón de arriba o desde Movimientos."
            viewAccountContext={{
              accountId: account.id,
              accountCurrency: account.currency,
              fx: fxRates
                ? { usdToArs: fxRates.usdArs, eurArs: fxRates.eurArs }
                : undefined,
              usdToArs: fxRates?.usdArs ?? undefined,
            }}
          />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Account detail page error:', error);
    redirect('/login');
  }
}
