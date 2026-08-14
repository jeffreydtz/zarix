'use client';

import { useState, useEffect } from 'react';
import { useOfflineQueue } from '@/lib/hooks/useOfflineQueue';
import { useBodyScrollLock } from '@/lib/hooks/useBodyScrollLock';
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
import {
  QUICK_CREATE_OPTION,
  QuickCreateAccountPanel,
  QuickCreateCategoryPanel,
} from '@/components/expenses/InlineQuickCreate';
import { sanitizeAmountInput } from '@/lib/sanitize-amount-input';
import { useRouter } from 'next/navigation';

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
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  useBodyScrollLock(isOpen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'manual' | 'chatbot'>('manual');

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [amountCurrency, setAmountCurrency] = useState<TransactionCurrency>('ARS');
  /** El usuario eligió la moneda a mano: no pisar su elección al elegir la cuenta. */
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  /** Panel inline "crear nueva cuenta/categoría" abierto dentro del form. */
  const [quickCreate, setQuickCreate] = useState<'account' | 'category' | null>(null);
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
      // Saldos cambian con cada movimiento: refetch siempre (offline cae al snapshot).
      fetchReferenceList<Account>('/api/accounts?lite=1', { force: true }),
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
    setCurrencyTouched(false);
    setAccountId('');
    setCategoryId('');
    setQuickCreate(null);
    setDescription('');
    setTransactionDateYmd(todayLocalYmd());
  };

  const handleClose = () => {
    setIsOpen(false);
    setActiveTab('manual');
    resetForm();
  };

  const handleCreate = async () => {
    setError('');
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
      amount: parseFloat(amount.replace(',', '.')),
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
      router.refresh();
    } catch {
      // If network failed mid-submit, queue it for later
      if (!navigator.onLine) {
        await enqueue(payload);
        handleClose();
      } else {
        setError('Error al crear el movimiento');
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
        <div className="fixed z-50 text-xs bg-warning/15 text-warning rounded-full px-3 py-1.5 shadow-md flex items-center gap-1.5 pointer-events-none bottom-[calc(8.5rem+env(safe-area-inset-bottom,0px))] right-4 md:bottom-24 md:right-6">
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
        data-tour="add"
        onClick={() => { setError(''); setIsOpen(true); }}
        className="fixed z-50 w-14 h-14 min-w-[56px] min-h-[56px] bg-primary hover:brightness-95 text-primary-foreground rounded-2xl shadow-lg shadow-primary/30 flex items-center justify-center transition-transform active:scale-95 touch-manipulation right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] md:bottom-6 md:right-6"
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
          <div className="bg-card rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 max-h-[min(92dvh,900px)] overflow-y-auto overscroll-contain shadow-2xl border border-border pb-[env(safe-area-inset-bottom,0px)]">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-foreground">
                  Nuevo Movimiento
                </h2>
                {!isOnline && (
                  <p className="text-xs text-warning mt-0.5">
                    Sin conexión — se guardará localmente
                  </p>
                )}
              </div>
              <button
                onClick={handleClose}
                className="text-muted-foreground hover:text-foreground p-1 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="mb-4 rounded-xl bg-secondary p-1">
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('manual')}
                  className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                    activeTab === 'manual'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground'
                  }`}
                >
                  Manual
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('chatbot')}
                  className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                    activeTab === 'chatbot'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground'
                  }`}
                >
                  Chatbot
                </button>
              </div>
            </div>

            {activeTab === 'chatbot' ? (
              <div className="space-y-3 rounded-2xl border border-border bg-secondary/70 p-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Escribí algo como: &quot;gasté 5000 en super&quot; o &quot;me entraron 800000 de sueldo&quot;.
                </p>
                <InternalAiChat embedded />
              </div>
            ) : dataLoading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-11 bg-secondary rounded-xl animate-pulse" />
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
                        ? 'bg-destructive text-destructive-foreground'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    💸 Gasto
                  </button>
                  <button
                    onClick={() => setType('income')}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      type === 'income'
                        ? 'bg-success text-primary-foreground'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    💰 Ingreso
                  </button>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                    Monto
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(sanitizeAmountInput(e.target.value))}
                      placeholder="0.00"
                      autoFocus
                      className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <MiniAmountCalculatorButton currentAmount={amount} onApply={setAmount} />
                    <select
                      value={amountCurrency}
                      onChange={(e) => {
                        setAmountCurrency(coerceTransactionCurrency(e.target.value));
                        setCurrencyTouched(true);
                      }}
                      className="w-[5.5rem] shrink-0 px-2 py-2.5 rounded-xl border border-border bg-card text-foreground text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
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
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                    Cuenta
                  </label>
                  <select
                    value={accountId}
                    onChange={(e) => {
                      const selectedAccountId = e.target.value;
                      if (selectedAccountId === QUICK_CREATE_OPTION) {
                        setQuickCreate('account');
                        return;
                      }
                      setAccountId(selectedAccountId);
                      setQuickCreate(null);
                      if (!currencyTouched) {
                        const selectedAccount = accounts.find((acc) => acc.id === selectedAccountId);
                        if (selectedAccount) {
                          setAmountCurrency(coerceTransactionCurrency(selectedAccount.currency));
                        }
                      }
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Seleccioná una cuenta</option>
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {formatAccountSelectLabel(acc)}
                      </option>
                    ))}
                    <option value={QUICK_CREATE_OPTION}>＋ Nueva cuenta…</option>
                  </select>
                  {quickCreate === 'account' && (
                    <QuickCreateAccountPanel
                      onCreated={(acc) => {
                        setAccounts((prev) => [...prev, acc as Account]);
                        setAccountId(acc.id);
                        if (!currencyTouched) {
                          setAmountCurrency(coerceTransactionCurrency(acc.currency));
                        }
                        setQuickCreate(null);
                      }}
                      onCancel={() => setQuickCreate(null)}
                    />
                  )}
                </div>

                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                    Categoría
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => {
                      if (e.target.value === QUICK_CREATE_OPTION) {
                        setQuickCreate('category');
                        return;
                      }
                      setCategoryId(e.target.value);
                      setQuickCreate(null);
                    }}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Sin categoría</option>
                    {filteredCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </option>
                    ))}
                    <option value={QUICK_CREATE_OPTION}>＋ Nueva categoría…</option>
                  </select>
                  {quickCreate === 'category' && (
                    <QuickCreateCategoryPanel
                      type={type}
                      onCreated={(cat) => {
                        setCategories((prev) => [...prev, cat]);
                        setCategoryId(cat.id);
                        setQuickCreate(null);
                        // Refresca el cache TTL para que la nueva categoría no desaparezca al reabrir.
                        fetchReferenceList<Category>('/api/categories', { force: true }).catch(() => {});
                      }}
                      onCancel={() => setQuickCreate(null)}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={transactionDateYmd}
                    onChange={(e) => setTransactionDateYmd(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                    Descripción
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="ej: Compra en supermercado"
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>

                <button
                  onClick={handleCreate}
                  disabled={loading || !amount || !accountId}
                  className="w-full py-3 rounded-xl font-semibold text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
