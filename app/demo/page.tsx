'use client';

/**
 * Demo público y aislado de Zarix.
 *
 * No importa Supabase ni ningún servicio: todo el estado vive en memoria
 * (useState). Recargar la página vuelve a los datos semilla. Nada de lo que
 * se hace acá toca la base de datos ni ninguna API.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';

// 1 USD = 1000 ARS (tasa fija solo para la demo).
const DEMO_RATE = 1000;

type DemoCurrency = 'ARS' | 'USD';
type DemoTxType = 'expense' | 'income';

interface DemoAccount {
  id: string;
  name: string;
  icon: string;
  currency: DemoCurrency;
  balance: number;
}

interface DemoTx {
  id: string;
  type: DemoTxType;
  amount: number;
  currency: DemoCurrency;
  accountId: string;
  categoryName: string;
  categoryIcon: string;
  description: string;
  createdAt: number;
}

const SEED_ACCOUNTS: DemoAccount[] = [
  { id: 'acc-ahorros', name: 'Cuenta de ahorros', icon: '🏦', currency: 'ARS', balance: 1_850_000 },
  { id: 'acc-efectivo', name: 'Efectivo', icon: '💵', currency: 'ARS', balance: 120_000 },
  { id: 'acc-usd', name: 'Dólares', icon: '💲', currency: 'USD', balance: 3_200 },
];

const SEED_TX: DemoTx[] = [
  { id: 'tx-1', type: 'income', amount: 1_400_000, currency: 'ARS', accountId: 'acc-ahorros', categoryName: 'Sueldo', categoryIcon: '💰', description: 'Sueldo de mayo', createdAt: Date.now() - 86400000 * 2 },
  { id: 'tx-2', type: 'expense', amount: 85_000, currency: 'ARS', accountId: 'acc-ahorros', categoryName: 'Supermercado', categoryIcon: '🛒', description: 'Compra semanal', createdAt: Date.now() - 86400000 },
  { id: 'tx-3', type: 'expense', amount: 45, currency: 'USD', accountId: 'acc-usd', categoryName: 'Suscripciones', categoryIcon: '📺', description: 'Streaming', createdAt: Date.now() - 3600000 * 5 },
  { id: 'tx-4', type: 'expense', amount: 12_000, currency: 'ARS', accountId: 'acc-efectivo', categoryName: 'Transporte', categoryIcon: '🚕', description: 'Taxi', createdAt: Date.now() - 3600000 * 2 },
];

const CATEGORIES = [
  { name: 'Supermercado', icon: '🛒' },
  { name: 'Transporte', icon: '🚕' },
  { name: 'Comida', icon: '🍔' },
  { name: 'Suscripciones', icon: '📺' },
  { name: 'Sueldo', icon: '💰' },
  { name: 'Otros', icon: '✨' },
];

function toArs(amount: number, currency: DemoCurrency) {
  return currency === 'USD' ? amount * DEMO_RATE : amount;
}

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function relTime(ts: number) {
  const diff = Date.now() - ts;
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'hace un momento';
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d !== 1 ? 's' : ''}`;
}

export default function DemoPage() {
  const [accounts, setAccounts] = useState<DemoAccount[]>(SEED_ACCOUNTS);
  const [transactions, setTransactions] = useState<DemoTx[]>(SEED_TX);
  const [modalOpen, setModalOpen] = useState(false);

  // Form
  const [type, setType] = useState<DemoTxType>('expense');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState(SEED_ACCOUNTS[0].id);
  const [categoryName, setCategoryName] = useState(CATEGORIES[0].name);
  const [description, setDescription] = useState('');

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? accounts[0];

  const totals = useMemo(() => {
    const ars = accounts.reduce((sum, a) => sum + toArs(a.balance, a.currency), 0);
    const usd = ars / DEMO_RATE;
    return { ars, usd };
  }, [accounts]);

  const sortedTx = useMemo(
    () => [...transactions].sort((a, b) => b.createdAt - a.createdAt),
    [transactions]
  );

  function resetForm() {
    setType('expense');
    setAmount('');
    setAccountId(accounts[0].id);
    setCategoryName(CATEGORIES[0].name);
    setDescription('');
  }

  function handleCreate() {
    const value = parseFloat(amount.replace(',', '.'));
    if (!value || value <= 0) return;
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;

    const cat = CATEGORIES.find((c) => c.name === categoryName) ?? CATEGORIES[0];
    const txCurrency = account.currency;

    const newTx: DemoTx = {
      id: `tx-${Date.now()}`,
      type,
      amount: value,
      currency: txCurrency,
      accountId: account.id,
      categoryName: cat.name,
      categoryIcon: cat.icon,
      description: description.trim() || cat.name,
      createdAt: Date.now(),
    };

    setTransactions((prev) => [newTx, ...prev]);
    setAccounts((prev) =>
      prev.map((a) =>
        a.id === account.id
          ? { ...a, balance: a.balance + (type === 'income' ? value : -value) }
          : a
      )
    );

    setModalOpen(false);
    resetForm();
  }

  function handleReset() {
    setAccounts(SEED_ACCOUNTS);
    setTransactions(SEED_TX);
    resetForm();
  }

  return (
    <div className="min-h-dvh bg-background">
      {/* Barra demo */}
      <div className="sticky top-0 z-30 border-b border-border bg-amber-500/10 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3 text-sm">
          <p className="text-amber-700 dark:text-amber-300 font-medium">
            🧪 Modo demo — nada se guarda. Recargá para reiniciar.
          </p>
          <Link
            href="/"
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Volver
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Demo</p>
            <h1 className="text-2xl font-bold text-foreground">Probá Zarix</h1>
          </div>
          <button
            type="button"
            onClick={handleReset}
            className="text-sm px-3 py-2 rounded-control border border-border text-muted-foreground hover:text-foreground hover:bg-surface-soft transition-colors"
          >
            Reiniciar demo
          </button>
        </div>

        {/* Patrimonio líquido */}
        <div className="card bg-emerald-50/85 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/25">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">💰</span>
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Patrimonio Líquido
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Para gastar hoy</p>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                ${fmt(totals.ars)}
              </span>
              <span className="text-sm font-medium text-slate-500">ARS</span>
            </div>
            <div className="text-lg font-semibold text-slate-600 dark:text-slate-400">
              USD {fmt(totals.usd, 2)}
            </div>
          </div>
        </div>

        {/* Cuentas */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {accounts.map((a) => (
            <div key={a.id} className="card">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{a.icon}</span>
                <span className="text-sm font-medium text-foreground truncate">{a.name}</span>
              </div>
              <p className="text-lg font-bold text-foreground">
                {a.currency === 'USD' ? 'USD ' : '$'}
                {fmt(a.balance, a.currency === 'USD' ? 2 : 0)}
              </p>
            </div>
          ))}
        </div>

        {/* Nuevo movimiento */}
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="w-full py-3 rounded-control font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors"
        >
          + Nuevo Movimiento
        </button>

        {/* Movimientos */}
        <div className="card">
          <h3 className="text-lg font-semibold text-foreground mb-4">Últimos Movimientos</h3>
          <div className="space-y-1">
            {sortedTx.map((tx) => {
              const acc = accounts.find((a) => a.id === tx.accountId);
              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between py-3 px-3 -mx-3 rounded-control hover:bg-surface-soft/80 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="text-2xl w-10 h-10 flex items-center justify-center rounded-control bg-surface-soft">
                      {tx.categoryIcon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-foreground truncate">{tx.description}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <span className="truncate">{acc?.name}</span>
                        <span className="text-slate-300">•</span>
                        <span>{relTime(tx.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                  <div
                    className={`font-bold text-right whitespace-nowrap ml-3 ${
                      tx.type === 'income'
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-500 dark:text-red-400'
                    }`}
                  >
                    {tx.type === 'income' ? '+' : '-'}$
                    {fmt(tx.amount, tx.currency === 'USD' ? 2 : 0)}{' '}
                    <span className="text-xs font-normal">{tx.currency}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CTA */}
        <div className="card text-center space-y-3">
          <p className="text-foreground font-semibold">¿Te gustó? Es gratis.</p>
          <p className="text-sm text-muted-foreground">
            Creá tu cuenta y empezá a trackear tu plata de verdad.
          </p>
          <Link
            href="/register"
            className="inline-block px-5 py-3 rounded-control font-semibold text-white bg-blue-500 hover:bg-blue-600 transition-colors"
          >
            Crear cuenta gratis
          </Link>
        </div>
      </div>

      {/* Modal nuevo movimiento */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center p-4 z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className="bg-white dark:bg-slate-800 rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 max-h-[90dvh] overflow-y-auto shadow-2xl border border-slate-200/80 dark:border-slate-700">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                Nuevo Movimiento
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
                aria-label="Cerrar"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex gap-2">
                <button
                  type="button"
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
                  type="button"
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

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Monto ({selectedAccount.currency})
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Cuenta
                </label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.icon} {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Categoría
                </label>
                <select
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </div>

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
                disabled={!amount || parseFloat(amount.replace(',', '.')) <= 0}
                className="w-full py-3 rounded-xl font-semibold text-white bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Crear Movimiento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
