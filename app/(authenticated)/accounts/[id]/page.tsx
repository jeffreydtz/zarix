import FxStatusBanner, { combinedFxStatus } from '@/components/ui/FxStatusBanner';
import Link from 'next/link';
import { notFound, redirect, unstable_rethrow } from 'next/navigation';
import { getCachedUser } from '@/lib/auth/session';
import FinancialDataError from '@/components/ui/FinancialDataError';
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
import AccountDetailEditButton from '@/components/accounts/AccountDetailEditButton';
import { getAccountDisplayName, getAccountTypeLabelEs } from '@/lib/account-display-name';
import { getCardStatement } from '@/lib/services/card-statement';
import CardStatementPanel from '@/components/dashboard/CardStatementPanel';

export default async function AccountDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const supabase = await createClient();
    const user = await getCachedUser();

    if (!user) {
      redirect('/login');
    }

    // params.id === account.id; usamos params.id en el filtro para poder
    // resolver getById en paralelo con el resto (un round-trip menos).
    const [account, accounts, transactions, categoriesResult, fxRates, cardStatement] = await Promise.all([
      accountsService.getById(params.id, user.id),
      accountsService.list(user.id, { allowPartialValuation: true }),
      transactionsService
        .list(user.id, { involveAccountId: params.id, limit: 500 }),
      supabase
        .from('categories')
        .select('*')
        .or(`user_id.eq.${user.id},is_system.eq.true`),
      cotizacionesService.getTransactionsFxRates(),
      getCardStatement(user.id, params.id),
    ]);

    if (!account) {
      notFound();
    }

    if (categoriesResult.error) throw categoriesResult.error;
    const categories = categoriesResult.data || [];

    const balance = Number(account.balance);
    const typeLabel = getAccountTypeLabelEs(account.type);
    const enriched = accounts.find((a) => a.id === account.id) as AccountWithBalance | undefined;
    const editableAccount = (enriched ?? { ...account, balance }) as AccountWithBalance;
    const isMulticurrencyCard =
      account.type === 'credit_card' &&
      account.is_multicurrency &&
      typeof enriched?.multicurrency_balance_secondary === 'number';
    const primaryDisplayBalance = isMulticurrencyCard
      ? Number(enriched?.multicurrency_balance_primary ?? balance)
      : balance;

    return (
      <div className="min-h-screen bg-background transition-colors">
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link
                href="/accounts"
                className="text-sm text-info hover:underline mb-2 inline-block"
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
                  <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                    {getAccountDisplayName(account)}
                  </h1>
                  <p className="text-muted-foreground text-sm">
                    {typeLabel} · {account.currency}
                  </p>
                </div>
              </div>
              <div className="mt-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                  Saldo actual
                </p>
                {isMulticurrencyCard ? (
                  <div className="space-y-1">
                    <p className="text-3xl font-bold tabular-nums text-destructive">
                      -$
                      {Math.abs(primaryDisplayBalance).toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      <span className="text-lg font-medium text-muted-foreground">{account.currency}</span>
                    </p>
                    <p className="text-3xl font-bold tabular-nums text-destructive">
                      -$
                      {Math.abs(Number(enriched.multicurrency_balance_secondary)).toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{' '}
                      <span className="text-lg font-medium text-muted-foreground">
                        {account.secondary_currency}
                      </span>
                    </p>
                    {!enriched.valuationIssue && !enriched.fxUnavailable && <p className="text-sm font-medium tabular-nums text-muted-foreground">
                      Total (ARS blue):{' '}
                      <span className="font-semibold text-destructive">
                        -$
                        {Math.abs(
                          Number(enriched.multicurrency_total_ars_blue ?? enriched.balance_ars_blue ?? 0)
                        ).toLocaleString('es-AR', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}{' '}
                        ARS
                      </span>
                    </p>}
                  </div>
                ) : (
                  <p
                    className={`text-3xl font-bold tabular-nums ${
                      account.is_debt ? 'text-destructive' : 'text-foreground'
                    }`}
                  >
                    {account.is_debt ? '-' : ''}$
                    {(account.is_debt ? Math.abs(balance) : balance).toLocaleString('es-AR', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    <span className="text-lg font-medium text-muted-foreground">{account.currency}</span>
                  </p>
                )}
                {enriched &&
                  (enriched.valuationIssue || (isMulticurrencyCard
                    ? Math.abs(
                        Number(enriched.multicurrency_total_ars_blue ?? enriched.balance_ars_blue ?? 0)
                      ) > 1e-8
                    : Math.abs(balance) > 1e-8)) && (
                  <div className="mt-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-0.5">
                      Referencia en otras monedas
                    </p>
                    <AccountBalanceEquivalents account={enriched} variant="detail" />
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-3 max-w-xl">
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
            <div className="flex items-center gap-2">
              <AccountDetailEditButton account={editableAccount} />
              <CreateTransactionButton defaultAccountId={account.id} />
            </div>
          </div>

          <FxStatusBanner {...combinedFxStatus(enriched ? [enriched] : [])} />
          {account.type === 'credit_card' && cardStatement && (
            <div className="card p-4">
              <h2 className="text-lg font-semibold text-foreground mb-1">Resumen proyectado</h2>
              <p className="text-sm text-muted-foreground">
                Cierre, vencimiento y cuotas pendientes de esta tarjeta. El saldo de la cuenta ya
                incluye las cuotas futuras; el vencimiento estima solo este resumen.
              </p>
              <CardStatementPanel statement={cardStatement} />
            </div>
          )}
          <RepairCurrencyRangePanel accountId={account.id} />

          <TransactionsList
            transactions={transactions}
            accounts={accounts}
            categories={categories}
            emptySubmessage="No hay movimientos que involucren esta cuenta. Podés cargar uno desde el botón de arriba o desde Movimientos."
            viewAccountContext={{
              accountId: account.id,
              accountCurrency: account.currency,
              fx: fxRates?.usdArs != null && fxRates.eurArs != null
                ? { usdToArs: fxRates.usdArs, eurArs: fxRates.eurArs }
                : undefined,
              usdToArs: fxRates?.usdArs ?? undefined,
            }}
          />
        </div>
      </div>
    );
  } catch (error) {
    unstable_rethrow(error);
    console.error('[account-detail] Financial data unavailable');
    return <FinancialDataError retryHref={`/accounts/${params.id}`} />;
  }
}
