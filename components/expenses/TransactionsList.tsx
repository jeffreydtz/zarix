'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TransactionWithCategory } from '@/lib/services/transactions';
import { formatAccountSelectLabel } from '@/lib/format-account-select';
import {
  aggregateOriginalByCurrency,
  impactInAccountCurrency,
  sumImpactInAccountCurrency,
} from '@/lib/transaction-account-impact';
import EditTransactionModal from './EditTransactionModal';

function fmtMoney(n: number, currency: string) {
  const abs = Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = n < 0 ? '-' : n > 0 ? '+' : '';
  return `${sign}$${abs} ${currency}`;
}

/** Línea secundaria: monto original si no coincide con la moneda de la cuenta vista. */
function secondaryOriginalLine(
  tx: TransactionWithCategory,
  accountId: string,
  viewCurrency: string
): string | null {
  const vc = viewCurrency.trim().toUpperCase();
  if (tx.account_id === accountId) {
    const oc = (tx.currency || 'ARS').trim().toUpperCase();
    if (oc !== vc) {
      const a = Number(tx.amount);
      if (tx.type === 'expense' || tx.type === 'transfer') {
        return `Comprobante: ${fmtMoney(-Math.abs(a), oc)}`;
      }
      if (tx.type === 'income') {
        return `Comprobante: ${fmtMoney(Math.abs(a), oc)}`;
      }
      if (tx.type === 'adjustment') {
        return `Ajuste: ${fmtMoney(a, oc)}`;
      }
    }
  }
  if (tx.type === 'transfer' && tx.destination_account_id === accountId) {
    const oc = (tx.currency || 'ARS').trim().toUpperCase();
    const destCur = (tx.destination_account?.currency || vc).trim().toUpperCase();
    if (oc !== destCur) {
      return `Origen: ${fmtMoney(-Math.abs(Number(tx.amount)), oc)}`;
    }
  }
  return null;
}

export interface ViewAccountContext {
  accountId: string;
  accountCurrency: string;
  /** Mismo criterio que transferencias / `create` — corrige filas con conversión 1:1 guardada mal. */
  fx?: { usdToArs: number; eurArs: number };
  /** USD → ARS (referencia en resumen); si falta, se usa `fx.usdToArs`. */
  usdToArs?: number | null;
}

function AccountMovementsSummaryCard({
  transactions,
  viewAccountContext,
}: {
  transactions: TransactionWithCategory[];
  viewAccountContext: ViewAccountContext;
}) {
  const { accountId, accountCurrency, fx, usdToArs: usdToArsLegacy } = viewAccountContext;
  const ac = accountCurrency.trim().toUpperCase();
  const usdToArs = fx?.usdToArs ?? usdToArsLegacy ?? undefined;
  const netListed = sumImpactInAccountCurrency(transactions, accountId, {
    accountCurrency: ac,
    fx: fx,
  });
  const byOrig = aggregateOriginalByCurrency(transactions, accountId);
  const origParts = Object.entries(byOrig)
    .filter(([, v]) => Math.abs(v) > 1e-8)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cur, v]) => fmtMoney(v, cur));
  const refArs =
    ac === 'USD' && usdToArs && usdToArs > 0 ? netListed * usdToArs : null;
  const refUsd =
    ac === 'ARS' && usdToArs && usdToArs > 0 ? netListed / usdToArs : null;

  return (
    <div className="card mb-3 border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-800/50">
      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
        Resumen de movimientos listados
      </p>
      <p className="text-lg font-bold tabular-nums text-slate-800 dark:text-slate-100">
        {fmtMoney(netListed, ac)}{' '}
        <span className="text-sm font-normal text-slate-500">(impacto neto en la cuenta)</span>
      </p>
      {transactions.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
          Todavía no hay movimientos en esta lista; el total neto es cero.
        </p>
      )}
      {origParts.length > 0 && (
        <p className="text-sm text-slate-600 dark:text-slate-300 mt-2">
          <span className="text-slate-500 dark:text-slate-400">Por moneda original: </span>
          {origParts.join(' · ')}
        </p>
      )}
      {refArs != null && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          Referencia aprox. en ARS (cotización actual):{' '}
          <span className="tabular-nums font-medium text-slate-600 dark:text-slate-300">
            {fmtMoney(refArs, 'ARS')}
          </span>
        </p>
      )}
      {refUsd != null && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
          Referencia aprox. en USD:{' '}
          <span className="tabular-nums font-medium text-slate-600 dark:text-slate-300">
            {fmtMoney(refUsd, 'USD')}
          </span>
        </p>
      )}
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
        La suma usa el mismo criterio que el saldo (incluye conversiones y transferencias). Si hay más
        movimientos fuera de esta lista, no coincidirá con el saldo actual.
      </p>
    </div>
  );
}

interface TransactionsListProps {
  transactions: TransactionWithCategory[];
  accounts?: Array<{ id: string; name: string; currency: string; balance: number }>;
  categories?: Array<{ id: string; name: string; type: string; icon: string }>;
  /** Texto bajo "No hay movimientos" (p. ej. en ficha de cuenta). */
  emptySubmessage?: string;
  /**
   * En ficha de cuenta: muestra impacto en moneda de la cuenta, desglose y total coherente con el saldo.
   */
  viewAccountContext?: ViewAccountContext;
}

export default function TransactionsList({ 
  transactions, 
  accounts = [], 
  categories = [],
  emptySubmessage = 'Usa el bot de Telegram para registrar gastos e ingresos',
  viewAccountContext,
}: TransactionsListProps) {
  const [editingTx, setEditingTx] = useState<TransactionWithCategory | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkAccountId, setBulkAccountId] = useState('');
  const [applyingBulk, setApplyingBulk] = useState(false);
  const [deletingBulk, setDeletingBulk] = useState(false);
  const enableListAnimations = transactions.length <= 40;

  const txDateMeta = useMemo(() => {
    const out = new Map<string, { dateLabel: string; distanceLabel: string }>();
    for (const tx of transactions) {
      const date = new Date(tx.transaction_date);
      out.set(tx.id, {
        dateLabel: date.toLocaleDateString('es-AR', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
        distanceLabel: formatDistanceToNow(date, {
          addSuffix: true,
          locale: es,
        }),
      });
    }
    return out;
  }, [transactions]);

  const handleSave = () => {
    setEditingTx(null);
    window.location.reload();
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => (prev.length === transactions.length ? [] : transactions.map((t) => t.id)));
  };

  const applyBulk = async () => {
    if (selectedIds.length === 0) {
      alert('Seleccioná al menos un movimiento');
      return;
    }

    const payload: {
      transactionIds: string[];
      categoryId?: string | null;
      accountId?: string;
    } = { transactionIds: selectedIds };

    if (bulkCategoryId) {
      payload.categoryId = bulkCategoryId === 'uncategorized' ? null : bulkCategoryId;
    }
    if (bulkAccountId) {
      payload.accountId = bulkAccountId;
    }

    if (!bulkCategoryId && !bulkAccountId) {
      alert('Elegí una categoría y/o cuenta para aplicar');
      return;
    }

    setApplyingBulk(true);
    try {
      const response = await fetch('/api/transactions/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudo aplicar el cambio masivo');
      }

      window.location.reload();
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Error en edición masiva');
    } finally {
      setApplyingBulk(false);
    }
  };

  const applyBulkDelete = async () => {
    if (selectedIds.length === 0) {
      alert('Seleccioná al menos un movimiento');
      return;
    }
    const n = selectedIds.length;
    if (
      !confirm(
        `¿Eliminar ${n} movimiento${n === 1 ? '' : 's'}? Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setDeletingBulk(true);
    try {
      const response = await fetch('/api/transactions/bulk', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionIds: selectedIds }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'No se pudieron eliminar los movimientos');
      }
      window.location.reload();
    } catch (error: unknown) {
      console.error(error);
      const message = error instanceof Error ? error.message : 'Error al eliminar';
      alert(message);
    } finally {
      setDeletingBulk(false);
    }
  };

  if (transactions.length === 0 && !viewAccountContext) {
    return (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card text-center py-16"
      >
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-5xl mb-4"
        >
          💸
        </motion.div>
        <p className="text-slate-500 dark:text-slate-400 mb-2">No hay movimientos</p>
        <p className="text-sm text-slate-400 dark:text-slate-500">{emptySubmessage}</p>
      </motion.div>
    );
  }

  const emptyAccountOnly = transactions.length === 0 && viewAccountContext;

  return (
    <>
      {!emptyAccountOnly && (
      <div className="card mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSelectionMode((v) => !v);
              setSelectedIds([]);
            }}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              selectionMode
                ? 'bg-blue-50 border-blue-400 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {selectionMode ? 'Salir selección masiva' : 'Edición masiva'}
          </button>

          {selectionMode && (
            <>
              <button
                type="button"
                onClick={toggleSelectAll}
                className="px-3 py-1.5 rounded-lg text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
              >
                {selectedIds.length === transactions.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
              </button>
              <span className="text-xs text-slate-500">Seleccionados: {selectedIds.length}</span>
            </>
          )}
        </div>

        {selectionMode && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
            <select
              value={bulkCategoryId}
              onChange={(e) => setBulkCategoryId(e.target.value)}
              className="input"
            >
              <option value="">Asignar categoría (opcional)</option>
              <option value="uncategorized">Sin categoría</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </option>
              ))}
            </select>

            <select value={bulkAccountId} onChange={(e) => setBulkAccountId(e.target.value)} className="input">
              <option value="">Asignar cuenta (opcional)</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {formatAccountSelectLabel(acc)}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={applyBulk}
              disabled={applyingBulk || deletingBulk || selectedIds.length === 0}
              className="btn btn-primary disabled:opacity-50"
            >
              {applyingBulk ? 'Aplicando...' : 'Aplicar cambios masivos'}
            </button>
          </div>
        )}

        {selectionMode && selectedIds.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-600 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={applyBulkDelete}
              disabled={deletingBulk || applyingBulk}
              className="px-3 py-1.5 rounded-lg text-sm border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-950/60 disabled:opacity-50"
            >
              {deletingBulk ? 'Eliminando...' : `Eliminar seleccionados (${selectedIds.length})`}
            </button>
          </div>
        )}
      </div>
      )}

      {viewAccountContext && (
        <AccountMovementsSummaryCard
          transactions={transactions}
          viewAccountContext={viewAccountContext}
        />
      )}

      {emptyAccountOnly && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card text-center py-16"
        >
          <motion.div
            animate={{ y: [0, -8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-5xl mb-4"
          >
            💸
          </motion.div>
          <p className="text-slate-500 dark:text-slate-400 mb-2">No hay movimientos</p>
          <p className="text-sm text-slate-400 dark:text-slate-500">{emptySubmessage}</p>
        </motion.div>
      )}

      {!emptyAccountOnly && (
      <motion.div
        initial={enableListAnimations ? 'hidden' : false}
        animate={enableListAnimations ? 'show' : undefined}
        variants={
          enableListAnimations
            ? {
                hidden: { opacity: 0 },
                show: { opacity: 1, transition: { staggerChildren: 0.05 } },
              }
            : undefined
        }
        className="space-y-3"
      >
        {transactions.map((tx) => {
          const vac = viewAccountContext;
          const dateMeta = txDateMeta.get(tx.id);
          const impact = vac
            ? impactInAccountCurrency(tx, vac.accountId, {
                accountCurrency: vac.accountCurrency.trim().toUpperCase(),
                fx: vac.fx,
              })
            : 0;
          const secondary =
            vac && secondaryOriginalLine(tx, vac.accountId, vac.accountCurrency);
          return (
          <motion.div 
            key={tx.id} 
            variants={
              enableListAnimations
                ? {
                    hidden: { opacity: 0, y: 20 },
                    show: { opacity: 1, y: 0 },
                  }
                : undefined
            }
            whileHover={enableListAnimations ? { scale: 1.01 } : undefined}
            onClick={() => {
              if (selectionMode) return;
              setEditingTx(tx);
            }}
            className={`card hover:shadow-lg transition-all group ${selectionMode ? '' : 'cursor-pointer'}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {selectionMode && (
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(tx.id)}
                    onChange={() => toggleSelection(tx.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4"
                  />
                )}
                <motion.div 
                  className="text-3xl w-12 h-12 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-700"
                  whileHover={enableListAnimations ? { scale: 1.1 } : undefined}
                >
                  {tx.category?.icon || (tx.type === 'income' ? '💰' : '💸')}
                </motion.div>

                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {tx.description || tx.category?.name || 'Sin descripcion'}
                  </div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    {tx.account?.name} • {dateMeta?.dateLabel ?? '—'} • {dateMeta?.distanceLabel ?? '—'}
                  </div>
                  {tx.notes && (
                    <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{tx.notes}</div>
                  )}
                  {tx.tags && tx.tags.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {tx.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="text-right flex items-center gap-3">
                <div>
                  {vac ? (
                    <>
                      <div
                        className={`text-xl font-bold tabular-nums ${
                          impact > 0
                            ? 'text-green-600 dark:text-green-400'
                            : impact < 0
                              ? 'text-red-500 dark:text-red-400'
                              : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {fmtMoney(impact, vac.accountCurrency.trim().toUpperCase())}
                      </div>
                      {secondary && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-[14rem] ml-auto">
                          {secondary}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div
                        className={`text-xl font-bold ${
                          tx.type === 'income'
                            ? 'text-green-600 dark:text-green-400'
                            : tx.type === 'expense'
                              ? 'text-red-500 dark:text-red-400'
                              : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                        ${tx.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-sm text-slate-500">{tx.currency}</div>
                    </>
                  )}
                  {tx.installment_number && tx.installment_total && (
                    <div className="text-xs text-slate-400 mt-1">
                      Cuota {tx.installment_number}/{tx.installment_total}
                    </div>
                  )}
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>

            {tx.type === 'transfer' && tx.destination_account_id && (
              <div className="mt-3 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-xl">
                {viewAccountContext?.accountId === tx.destination_account_id ? (
                  <>
                    ← Transferencia desde {tx.account?.name ?? 'otra cuenta'}
                  </>
                ) : (
                  <>→ Transferencia a {tx.destination_account?.name ?? 'otra cuenta'}</>
                )}
                {tx.exchange_rate && tx.exchange_rate !== 1 && (
                  <span className="ml-2 text-xs">
                    (tipo cambio: {Number(tx.exchange_rate).toFixed(4)})
                  </span>
                )}
              </div>
            )}
          </motion.div>
          );
        })}
      </motion.div>
      )}

      <AnimatePresence>
        {editingTx && (
          <EditTransactionModal
            transaction={editingTx}
            accounts={accounts}
            categories={categories}
            onClose={() => setEditingTx(null)}
            onSave={handleSave}
          />
        )}
      </AnimatePresence>
    </>
  );
}
