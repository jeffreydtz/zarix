'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Plus, X } from 'lucide-react';
import { useOfflineQueue } from '@/lib/hooks/useOfflineQueue';
import { useBodyScrollLock } from '@/lib/hooks/useBodyScrollLock';
import { formatAccountSelectLabel } from '@/lib/format-account-select';
import { calendarDateToUtcNoonIso, todayLocalYmd } from '@/lib/transaction-date';
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
import MiniAmountCalculatorButton from '@/components/ui/MiniAmountCalculatorButton';
import InternalAiChat from '@/components/dashboard/InternalAiChat';
import {
  QUICK_CREATE_OPTION,
  QuickCreateAccountPanel,
  QuickCreateCategoryPanel,
} from '@/components/expenses/InlineQuickCreate';
import { sanitizeAmountInput } from '@/lib/sanitize-amount-input';
import { CategoryIcon } from '@/lib/category-icons';
import type { AccountType } from '@/types/database';

type Account = {
  id: string;
  name: string;
  currency: string;
  balance: number;
  type?: AccountType;
  last_4_digits?: string | null;
};

type Category = {
  id: string;
  name: string;
  icon: string;
  type: string;
};

type OpenOpts = { type?: 'expense' | 'income' | 'transfer' };
type AddCtx = { open: (opts?: OpenOpts) => void; close: () => void };

const AddTransactionContext = createContext<AddCtx | null>(null);

export function useAddTransaction(): AddCtx {
  const ctx = useContext(AddTransactionContext);
  if (!ctx) {
    return { open: () => {}, close: () => {} };
  }
  return ctx;
}

export function AddTransactionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  useBodyScrollLock(isOpen);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [dataLoading, setDataLoading] = useState(false);
  const [mode, setMode] = useState<'quick' | 'chat'>('quick');
  const [showMore, setShowMore] = useState(false);

  const [type, setType] = useState<'expense' | 'income' | 'transfer'>('expense');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [amountCurrency, setAmountCurrency] = useState<TransactionCurrency>('ARS');
  const [currencyTouched, setCurrencyTouched] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [quickCreate, setQuickCreate] = useState<'account' | 'category' | null>(null);
  const [description, setDescription] = useState('');
  const [transactionDateYmd, setTransactionDateYmd] = useState(() => todayLocalYmd());

  const { isOnline, pendingCount, syncing, enqueue } = useOfflineQueue();

  const resetForm = useCallback(() => {
    setType('expense');
    setDestinationAccountId('');
    setAmount('');
    setAmountCurrency('ARS');
    setCurrencyTouched(false);
    setAccountId('');
    setCategoryId('');
    setQuickCreate(null);
    setDescription('');
    setTransactionDateYmd(todayLocalYmd());
    setShowMore(false);
    setMode('quick');
    setError('');
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    resetForm();
  }, [resetForm]);

  const open = useCallback((opts?: OpenOpts) => {
    setError('');
    if (opts?.type) setType(opts.type);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setTransactionDateYmd(todayLocalYmd());
    setDataLoading(true);
    const cachedAccs = getOfflineCachedAccounts<Account>();
    const cachedCats = getOfflineCachedCategories<Category>();
    const online = typeof navigator !== 'undefined' && navigator.onLine;
    Promise.all([
      fetchReferenceList<Account>('/api/accounts?lite=1', { force: true }),
      fetchReferenceList<Category>('/api/categories', { ttlMs: 2 * 60 * 1000 }),
    ]).then(([accsRaw, catsRaw]) => {
      maybePersistAccountsSnapshot(accsRaw, online);
      maybePersistCategoriesSnapshot(catsRaw, online);
      const accs = pickReferenceList(accsRaw, cachedAccs);
      setAccounts(accs);
      setCategories(pickReferenceList(catsRaw, cachedCats));
      setDataLoading(false);
    });
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || accountId || accounts.length === 0) return;
    const preferred =
      accounts.find((a) => coerceTransactionCurrency(a.currency) === amountCurrency) || accounts[0];
    setAccountId(preferred.id);
    if (!currencyTouched) {
      setAmountCurrency(coerceTransactionCurrency(preferred.currency));
    }
  }, [isOpen, accounts, accountId, amountCurrency, currencyTouched]);

  const handleCreate = async () => {
    setError('');
    if (!amount || !accountId) return;
    if (type === 'transfer' && !destinationAccountId) return;
    setLoading(true);
    const account = accounts.find((a) => a.id === accountId);
    if (!account) {
      setLoading(false);
      return;
    }
    const payload = {
      type,
      accountId,
      destinationAccountId: type === 'transfer' ? destinationAccountId : undefined,
      amount: parseFloat(amount.replace(',', '.')),
      currency: amountCurrency,
      categoryId: type === 'transfer' ? null : categoryId || null,
      description,
      transactionDate: calendarDateToUtcNoonIso(transactionDateYmd),
    };
    try {
      if (!isOnline) {
        await enqueue(payload);
        close();
        return;
      }
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Error al crear el movimiento');
      close();
      router.refresh();
    } catch {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        await enqueue(payload);
        close();
      } else {
        setError('No se pudo guardar. Probá de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredCategories = categories.filter((c) => c.type === type || c.type === 'both');
  const ctx = useMemo(() => ({ open, close }), [open, close]);

  return (
    <AddTransactionContext.Provider value={ctx}>
      {children}
      {(pendingCount > 0 || syncing) && (
        <div className="pointer-events-none fixed z-50 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 md:bottom-6 md:left-auto md:right-6 md:translate-x-0 text-xs bg-warning/15 text-warning rounded-full px-3 py-1.5 shadow-md flex items-center gap-1.5">
          {syncing ? 'Sincronizando...' : `${pendingCount} pendiente${pendingCount !== 1 ? 's' : ''}`}
        </div>
      )}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-4 z-[60] overscroll-contain"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="bg-card rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 max-h-[min(92dvh,900px)] overflow-y-auto overscroll-contain shadow-2xl border border-border pb-[env(safe-area-inset-bottom,0px)]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold text-foreground">Nuevo movimiento</h2>
                {!isOnline && (
                  <p className="text-xs text-warning mt-0.5">Sin conexión — se guarda en el teléfono</p>
                )}
              </div>
              <button
                type="button"
                onClick={close}
                className="text-muted-foreground hover:text-foreground p-2 rounded-lg"
                aria-label="Cerrar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="mb-4 rounded-xl bg-secondary p-1 grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setMode('quick')}
                className={`rounded-lg py-2 text-sm font-medium ${
                  mode === 'quick' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                <Plus className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                Rápido
              </button>
              <button
                type="button"
                onClick={() => setMode('chat')}
                className={`rounded-lg py-2 text-sm font-medium ${
                  mode === 'chat' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground'
                }`}
              >
                <MessageSquare className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                Escribirlo
              </button>
            </div>

            {mode === 'chat' ? (
              <InternalAiChat embedded />
            ) : dataLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-11 bg-secondary rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex gap-2">
                  {(
                    [
                      ['expense', 'Gasto'],
                      ['income', 'Ingreso'],
                      ['transfer', 'Transferir'],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setType(value)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${
                        type === value
                          ? value === 'expense'
                            ? 'bg-destructive text-destructive-foreground'
                            : value === 'income'
                              ? 'bg-success text-primary-foreground'
                              : 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(sanitizeAmountInput(e.target.value))}
                      placeholder="0"
                      autoFocus
                      className="flex-1 min-w-0 px-4 py-3 rounded-xl border border-border bg-card text-foreground text-2xl font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <MiniAmountCalculatorButton currentAmount={amount} onApply={setAmount} />
                    <select
                      value={amountCurrency}
                      onChange={(e) => {
                        setAmountCurrency(coerceTransactionCurrency(e.target.value));
                        setCurrencyTouched(true);
                      }}
                      className="w-[5.5rem] shrink-0 px-2 py-2.5 rounded-xl border border-border bg-card text-foreground text-sm font-medium"
                    >
                      {TRANSACTION_CURRENCIES.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {type !== 'transfer' && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Categoría</p>
                  <div className="flex flex-wrap gap-1.5">
                    {filteredCategories.slice(0, 8).map((cat) => {
                      const active = categoryId === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setCategoryId(active ? '' : cat.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border ${
                            active
                              ? 'bg-primary/15 text-primary border-primary/40'
                              : 'bg-secondary text-foreground border-transparent'
                          }`}
                        >
                          <CategoryIcon icon={cat.icon} className="w-3.5 h-3.5" />
                          {cat.name}
                        </button>
                      );
                    })}
                  </div>
                  {filteredCategories.length > 8 && (
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
                      className="mt-2 w-full px-3 py-2 rounded-xl border border-border bg-card text-sm"
                    >
                      <option value="">Otra categoría…</option>
                      {filteredCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                      <option value={QUICK_CREATE_OPTION}>Nueva categoría…</option>
                    </select>
                  )}
                  {quickCreate === 'category' && (
                    <QuickCreateCategoryPanel
                      type={type === 'income' ? 'income' : 'expense'}
                      onCreated={(cat) => {
                        setCategories((prev) => [...prev, cat]);
                        setCategoryId(cat.id);
                        setQuickCreate(null);
                        fetchReferenceList<Category>('/api/categories', { force: true }).catch(() => {});
                      }}
                      onCancel={() => setQuickCreate(null)}
                    />
                  )}
                </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                    {type === 'transfer' ? 'Origen' : 'Cuenta'}
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
                    className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {formatAccountSelectLabel(acc)}
                      </option>
                    ))}
                    <option value={QUICK_CREATE_OPTION}>Nueva cuenta…</option>
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

                {type === 'transfer' && (
                  <div>
                    <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                      Destino
                    </label>
                    <select
                      value={destinationAccountId}
                      onChange={(e) => setDestinationAccountId(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-card text-foreground"
                    >
                      <option value="">Seleccioná destino</option>
                      {accounts
                        .filter((acc) => acc.id !== accountId)
                        .map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {formatAccountSelectLabel(acc)}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowMore((v) => !v)}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  {showMore ? 'Menos datos' : 'Fecha y descripción'}
                </button>
                {showMore && (
                  <div className="space-y-3">
                    <input
                      type="date"
                      value={transactionDateYmd}
                      onChange={(e) => setTransactionDateYmd(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-card"
                    />
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="ej: Compra en el súper"
                      className="w-full px-4 py-2.5 rounded-xl border border-border bg-card"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={
                    loading || !amount || !accountId || (type === 'transfer' && !destinationAccountId)
                  }
                  className="w-full py-3 rounded-xl font-semibold text-primary-foreground bg-primary hover:brightness-95 disabled:opacity-50"
                >
                  {loading ? 'Guardando...' : isOnline ? 'Guardar' : 'Guardar offline'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AddTransactionContext.Provider>
  );
}
