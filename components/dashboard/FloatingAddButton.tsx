'use client';

import { useState, useEffect } from 'react';
import { useOfflineQueue } from '@/lib/hooks/useOfflineQueue';
import { formatAccountSelectLabel } from '@/lib/format-account-select';
import {
  calendarDateToUtcNoonIso,
  todayLocalYmd,
} from '@/lib/transaction-date';
import {
  TRANSACTION_CURRENCIES,
  coerceTransactionCurrency,
  type TransactionCurrency,
} from '@/lib/constants/transaction-currencies';
import {
  fetchReferenceList,
  getOfflineCachedAccounts,
  getOfflineCachedCategories,
  maybePersistAccountsSnapshot,
  maybePersistCategoriesSnapshot,
  pickReferenceList,
} from '@/lib/offline-reference-cache';
import type { AccountType } from '@/types/database';
import MiniAmountCalculatorButton from '@/components/ui/MiniAmountCalculatorButton';
import InternalAiChat from '@/components/dashboard/InternalAiChat';

interface Account {
  id: string;
  name: string;
  currency: string;
  balance: number;
  type?: AccountType;
  last_4_digits?: string | null;
}

interface Category {
  id: string;
  name: string;
  icon: string;
  type: string;
}

export default function FloatingAddButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'manual' | 'chatbot'>('manual');

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [amountCurrency, setAmountCurrency] = useState<TransactionCurrency>('ARS');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [transactionDateYmd, setTransactionDateYmd] = useState(() => todayLocalYmd());

  const { isOnline, pendingCount, syncing, enqueue } = useOfflineQueue();

  // Fetch accounts + categories when the modal opens (snapshot en localStorage para offline)
  useEffect(() => {
    if (!isOpen) return;
    setTransactionDateYmd(todayLocalYmd());
    setDataLoading(true);

    const cachedAccs = getOfflineCachedAccounts<Account>();
    const cachedCats = getOfflineCachedCategories<Category>();
    const online = typeof navigator !== 'undefined' && navigator.onLine;

    Promise.all([
      fetchReferenceList<Account>('/api/accounts?lite=1', { ttlMs: 2 * 60 * 1000 }),
      fetchReferenceList<Category>('/api/categories', { ttlMs: 2 * 60 * 1000 }),
    ]).then(([accsRaw, catsRaw]) => {
      maybePersistAccountsSnapshot(accsRaw, online);
      maybePersistCategoriesSnapshot(catsRaw, online);

      setAccounts(pickReferenceList(accsRaw, cachedAccs));
      setCategories(pickReferenceList(catsRaw, cachedCats));
      setDataLoading(false);
    });
  }, [isOpen]);

  const resetForm = () => {
    setType('expense');
    setAmount('');
    setAmountCurrency('ARS');
    setAccountId('');
    setCategoryId('');
    setDescription('');
    setTransactionDateYmd(todayLocalYmd());
  };

  const handleClose = () => {
    setIsOpen(false);
    setActiveTab('manual');
    resetForm();
  };

  const handleCreate = async () => {
    if (!amount || !accountId) return;
    setLoading(true);

    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      setLoading(false);
      return;
    }

    const payload = {
      type,
      accountId,
      amount: parseFloat(amount),
      currency: amountCurrency,
      categoryId: categoryId || null,
      description,
      transactionDate: calendarDateToUtcNoonIso(transactionDateYmd),
    };

    try {
      if (!isOnline) {
        await enqueue(payload);
        handleClose();
        return;
      }

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Error al crear el movimiento');

      handleClose();
      window.location.reload();
    } catch {
      // If network failed mid-submit, queue it for later
      if (!navigator.onLine) {
        await enqueue(payload);
        handleClose();
      } else {
        alert('Error al crear el movimiento');
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredCategories = categories.filter(
    (c) => c.type === type || c.type === 'both'
  );

  return (
    <>
      {/* Pending sync indicator */}
      {(pendingCount > 0 || syncing) && (
        <div className="fixed z-50 text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 rounded-full px-3 py-1.5 shadow-md flex items-center gap-1.5 pointer-events-none bottom-[calc(8.5rem+env(safe-area-inset-bottom,0px))] right-4 md:bottom-24 md:right-6">
          {syncing ? (
            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <span>📤</span>
          )}
          <span>
            {syncing
              ? 'Sincronizando...'
              : `${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}`}
          </span>
        </div>
      )}

      {/* Floating Action Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed z-50 w-14 h-14 min-w-[56px] min-h-[56px] bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-2xl shadow-lg shadow-blue-500/30 flex items-center justify-center transition-transform active:scale-95 touch-manipulation right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:bottom-6 md:right-6"
        title="Nuevo Movimiento"
        aria-label="Nuevo Movimiento"
      >
        <svg
          className="w-7 h-7"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {/* Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-4 z-[60] overscroll-contain"
          onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
          <div className="bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 max-h-[min(92dvh,900px)] overflow-y-auto overscroll-contain shadow-2xl border border-slate-200/80 dark:border-slate-700 pb-[env(safe-area-inset-bottom,0px)]">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  Nuevo Movimiento
                </h2>
                {!isOnline && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                    Sin conexión — se guardará localmente
                  </p>
                )}
              </div>
              <button
                onClick={handleClose}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4 rounded-xl bg-slate-100 p-1 dark:bg-slate-700/60">
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('manual')}
                  className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                    activeTab === 'manual'
                      ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('chatbot')}
                  className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                    activeTab === 'chatbot'
                      ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-800 dark:text-slate-100'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  Chatbot
                </button>
              </div>
            </div>

            {activeTab === 'chatbot' ? (
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Escribí algo como: &quot;gasté 5000 en super&quot; o &quot;me entraron 800000 de sueldo&quot;.
                </p>
                <InternalAiChat embedded />
              </div>
            ) : dataLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-11 bg-slate-100 dark:bg-slate-700 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Type selector */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setType('expense')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      type === 'expense'
                        ? 'bg-red-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    💸 Gasto
                  </button>
                  <button
                    onClick={() => setType('income')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      type === 'income'
                        ? 'bg-green-500 text-white'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    💰 Ingreso
                  </button>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Monto
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      autoFocus
                      className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <MiniAmountCalculatorButton currentAmount={amount} onApply={setAmount} />
                    <select
                      value={amountCurrency}
                      onChange={(e) => setAmountCurrency(coerceTransactionCurrency(e.target.value))}
                      className="w-[5.5rem] shrink-0 px-2 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
                      title="Moneda del monto"
                    >
                      {TRANSACTION_CURRENCIES.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Account */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Cuenta
                  </label>
                  <select
                    value={accountId}
                    onChange={(e) => {
                      const selectedAccountId = e.target.value;
                      setAccountId(selectedAccountId);
                      const selectedAccount = accounts.find((acc) => acc.id === selectedAccountId);
                      if (selectedAccount) {
                        setAmountCurrency(coerceTransactionCurrency(selectedAccount.currency));
                      }
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Seleccioná una cuenta</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {formatAccountSelectLabel(acc)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Categoría
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Sin categoría</option>
                    {filteredCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={transactionDateYmd}
                    onChange={(e) => setTransactionDateYmd(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Descripción
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="ej: Compra en supermercado"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  onClick={handleCreate}
                  disabled={loading || !amount || !accountId}
                  className="w-full py-3 rounded-xl font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading
                    ? 'Guardando...'
                    : isOnline
                    ? 'Crear Movimiento'
                    : 'Guardar Offline'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
