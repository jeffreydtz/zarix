'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import type { AccountAggregates, AccountWithBalance } from '@/lib/services/accounts';
import { getAccountDisplayName } from '@/lib/account-display-name';
import { useState } from 'react';
import AnimatedNumber from '@/components/ui/AnimatedNumber';
import AccountBalanceEquivalents from '@/components/accounts/AccountBalanceEquivalents';
import EditAccountModal from '@/components/accounts/EditAccountModal';

interface AccountsListProps {
  accounts: AccountWithBalance[];
  aggregates: AccountAggregates | null;
}

export default function AccountsList({ accounts, aggregates }: AccountsListProps) {
  const [loading, setLoading] = useState(false);
  const [editAccount, setEditAccount] = useState<AccountWithBalance | null>(null);

  const handleDelete = async (id: string, name: string) => {
    if (
      !confirm(
        `Archivar la cuenta "${name}"?\n\n` +
          `Dejará de mostrarse en listados y totales. Los movimientos no se borran; podés restaurarla más abajo si hace falta.`
      )
    ) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/accounts/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error deleting account');
      }

      window.location.reload();
    } catch (error: unknown) {
      console.error('Error:', error);
      alert(error instanceof Error ? error.message : 'Error al eliminar la cuenta');
    } finally {
      setLoading(false);
    }
  };

  if (accounts.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card text-center py-16"
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-6xl mb-4"
        >
          🏦
        </motion.div>
        <p className="text-slate-500 dark:text-slate-400 mb-2 text-lg">No tenes cuentas todavia</p>
        <p className="text-sm text-slate-400 dark:text-slate-500">
          Crea tu primera cuenta para empezar a trackear tus finanzas
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { staggerChildren: 0.08 } },
      }}
      className="space-y-4"
    >
      <AnimatePresence mode="popLayout">
        {accounts.map((account, index) => {
          const isMulticurrencyCard =
            account.type === 'credit_card' &&
            account.is_multicurrency &&
            typeof account.multicurrency_balance_secondary === 'number';
          const multicurrencyPrimaryBalance = Number(
            account.multicurrency_balance_primary ?? account.balance
          );
          const primaryCur = account.currency;
          const secondaryCur = account.secondary_currency || '';
          return (
            <motion.div
              key={account.id}
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.01 }}
              className="card hover:shadow-lg transition-shadow"
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-row items-start gap-2 sm:gap-3">
                  <Link
                    href={`/accounts/${account.id}`}
                    className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0 rounded-xl -m-1 p-2 hover:bg-slate-50/90 dark:hover:bg-slate-700/50 transition-colors group"
                  >
                    <motion.div
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      whileTap={{ scale: 0.95 }}
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-sm shrink-0"
                      style={{ backgroundColor: `${account.color}20` }}
                    >
                      {account.icon || '💳'}
                    </motion.div>

                    <div className="flex-1 min-w-0 pr-1">
                      <div className="font-semibold text-lg text-slate-800 dark:text-slate-200 leading-snug group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                        {getAccountDisplayName(account)}
                      </div>
                      <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                        <span className="font-medium tabular-nums">{account.currency}</span>
                        {account.type === 'credit_card' && account.last_4_digits && (
                          <span className="text-xs font-mono text-slate-400">
                            · ····{account.last_4_digits}
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>

                  <div className="flex flex-col items-end justify-start gap-1 text-right shrink-0 min-w-[7.5rem]">
                    {isMulticurrencyCard ? (
                      <div className="text-right space-y-0.5">
                        <div className="text-base sm:text-lg font-bold tabular-nums text-red-500">
                          -$
                          {Math.abs(multicurrencyPrimaryBalance).toLocaleString('es-AR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
                            {primaryCur}
                          </span>
                        </div>
                        <div className="text-base sm:text-lg font-bold tabular-nums text-red-500">
                          -$
                          {Math.abs(Number(account.multicurrency_balance_secondary)).toLocaleString('es-AR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}{' '}
                          <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
                            {secondaryCur}
                          </span>
                        </div>
                        <div className="text-[11px] sm:text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
                          Total (ARS blue):{' '}
                          <span className="font-semibold text-red-500">
                            -$
                            {Math.abs(
                              Number(account.multicurrency_total_ars_blue ?? account.balance_ars_blue ?? 0)
                            ).toLocaleString('es-AR', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{' '}
                            ARS
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div
                        className={`text-lg sm:text-xl font-bold tabular-nums flex flex-wrap items-baseline justify-end gap-x-1 ${account.is_debt ? 'text-red-500' : 'text-slate-800 dark:text-slate-200'}`}
                      >
                        <AnimatedNumber
                          value={
                            account.is_debt ? Math.abs(Number(account.balance)) : Number(account.balance)
                          }
                          prefix={account.is_debt ? '-$' : '$'}
                          decimals={2}
                        />
                        <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400 shrink-0">
                          {account.currency}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-1 shrink-0 self-start pt-1">
                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setEditAccount(account)}
                      className="p-2 rounded-xl hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-500"
                      title="Editar cuenta"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </motion.button>
                    <motion.button
                      type="button"
                      title="Archivar cuenta"
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleDelete(account.id, getAccountDisplayName(account))}
                      disabled={loading}
                      className="p-2 rounded-xl hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 disabled:opacity-50"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </motion.button>
                  </div>
                </div>

                {(isMulticurrencyCard
                  ? Math.abs(
                      Number(account.multicurrency_total_ars_blue ?? account.balance_ars_blue ?? 0)
                    ) > 1e-8
                  : Math.abs(Number(account.balance)) > 1e-8) && (
                  <div className="w-full pl-[4.25rem] sm:pl-[4.5rem] -mt-0.5 border-t border-slate-200/70 dark:border-slate-700/60 pt-2">
                    <AccountBalanceEquivalents account={account} />
                  </div>
                )}
              </div>

              {account.min_balance && account.balance < account.min_balance && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-3 text-sm text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-xl border border-yellow-200 dark:border-yellow-800"
                >
                  Saldo por debajo del minimo (${account.min_balance.toFixed(2)})
                </motion.div>
              )}

              {account.type === 'credit_card' && account.credit_limit && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700"
                >
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-slate-500 dark:text-slate-400 text-xs mb-0.5">Limite</p>
                      <p className="font-semibold text-slate-700 dark:text-slate-300">
                        ${account.credit_limit.toLocaleString('es-AR')}
                      </p>
                    </div>
                    {account.closing_day && (
                      <div>
                        <p className="text-slate-500 dark:text-slate-400 text-xs mb-0.5">Cierre</p>
                        <p className="font-semibold text-slate-700 dark:text-slate-300">
                          Dia {account.closing_day}
                        </p>
                      </div>
                    )}
                    {account.due_day && (
                      <div>
                        <p className="text-slate-500 dark:text-slate-400 text-xs mb-0.5">
                          Vencimiento
                        </p>
                        <p className="font-semibold text-slate-700 dark:text-slate-300">
                          Dia {account.due_day}
                        </p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {aggregates && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="card border border-slate-200/80 dark:border-slate-600/80 bg-slate-50/80 dark:bg-slate-800/40"
        >
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide mb-3">
            Totales (cotización dólar blue)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
            Solo suman acá las cuentas con <strong>Incluir en totales</strong> (editar cuenta): eso
            las saca del patrimonio del panel pero <strong>no las archiva</strong>; siguen en la
            lista de arriba. Dentro de esas, la <strong>liquidez</strong> respeta “Contar en
            patrimonio líquido”; las inversiones van aparte.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Patrimonio total</p>
              <p className="text-2xl font-bold tabular-nums text-slate-800 dark:text-slate-100">
                ${aggregates.totalARSBlue.toLocaleString('es-AR', { maximumFractionDigits: 0 })}{' '}
                <span className="text-base font-medium text-slate-500">ARS</span>
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 tabular-nums">
                USD{' '}
                {aggregates.totalUSD.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-slate-500 dark:text-slate-400">Liquidez</span>
                <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                  ${aggregates.liquidARSBlue.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ARS
                </span>
              </div>
              {(aggregates.investmentsARSBlue > 0 || aggregates.investmentsUSD > 0) && (
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500 dark:text-slate-400">Inversiones</span>
                  <span className="font-medium tabular-nums text-slate-800 dark:text-slate-200">
                    $
                    {aggregates.investmentsARSBlue.toLocaleString('es-AR', {
                      maximumFractionDigits: 0,
                    })}{' '}
                    ARS
                  </span>
                </div>
              )}
            </div>
          </div>
          {aggregates.totalCreditLimit > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-600 text-sm">
              <div className="flex justify-between gap-4 text-slate-600 dark:text-slate-400">
                <span>Tarjetas de crédito (líneas)</span>
                <span className="tabular-nums">
                  ${aggregates.totalCreditUsed.toLocaleString('es-AR', { minimumFractionDigits: 0 })}{' '}
                  / $
                  {aggregates.totalCreditLimit.toLocaleString('es-AR', { minimumFractionDigits: 0 })}
                  {aggregates.creditUtilization > 0 && (
                    <span className="text-slate-500 dark:text-slate-500">
                      {' '}
                      ({aggregates.creditUtilization}%)
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
        </motion.div>
      )}

      {editAccount && <EditAccountModal account={editAccount} onClose={() => setEditAccount(null)} />}
    </motion.div>
  );
}
