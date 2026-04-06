'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { CategoryIcon } from '@/lib/category-icons';

type RangeType = 'day' | 'week' | 'month' | 'year' | 'custom';
type AnalyzerMode = 'expense' | 'income';

/** Shape aligned with API `/api/transactions` rows; safe to pass from RSC. */
export interface SpendingAnalyzerTxItem {
  id: string;
  type: 'expense' | 'income' | 'transfer' | 'adjustment';
  amount: number;
  currency: string;
  amount_in_account_currency: number;
  category?: { name: string; icon: string } | null;
  account?: { name: string; currency: string } | null;
  transaction_date: string;
  description?: string | null;
}

type TxItem = SpendingAnalyzerTxItem;

interface CategorySlice {
  name: string;
  icon: string;
  amount: number;
  percent: number;
  color: string;
}

const COLORS = [
  '#F59E0B', '#EF4444', '#3B82F6', '#10B981', '#8B5CF6',
  '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1',
];
const MAX_PIE_SLICES = 8;

function toInputDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function getRange(range: RangeType, customFrom: string, customTo: string, anchorDate: Date) {
  const end = toInputDate(anchorDate);
  let start = end;

  if (range === 'day') {
    start = end;
  } else if (range === 'week') {
    const d = new Date(anchorDate);
    const day = d.getDay();
    const diff = day === 0 ? 6 : day - 1; // monday as first day
    d.setDate(d.getDate() - diff);
    start = toInputDate(d);
  } else if (range === 'month') {
    start = `${anchorDate.getFullYear()}-${String(anchorDate.getMonth() + 1).padStart(2, '0')}-01`;
  } else if (range === 'year') {
    start = `${anchorDate.getFullYear()}-01-01`;
  } else {
    let s = customFrom || end;
    let e = customTo || end;
    if (s > e) {
      const t = s;
      s = e;
      e = t;
    }
    return { startDate: s, endDate: e };
  }

  return { startDate: start, endDate: end };
}

/** Día calendario local (no el prefijo UTC del ISO), alineado con los rangos del analizador. */
function txLocalCalendarDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function txInDateRange(tx: TxItem, start: string, end: string): boolean {
  const d = txLocalCalendarDay(tx.transaction_date);
  if (!d) return false;
  return d >= start && d <= end;
}

function filterPoolForPeriod(
  pool: TxItem[],
  mode: AnalyzerMode,
  startDate: string,
  endDate: string
): TxItem[] {
  return pool.filter((t) => t.type === mode && txInDateRange(t, startDate, endDate));
}

function parseYmdLocal(ymd: string): Date {
  if (!ymd || ymd.length < 10) return new Date(NaN);
  const y = Number(ymd.slice(0, 4));
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return new Date(NaN);
  return new Date(y, m - 1, d);
}

function prevPeriodBounds(startDate: string, endDate: string): { ps: string; pe: string } | null {
  const start = parseYmdLocal(startDate);
  const end = parseYmdLocal(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(days - 1));
  return { ps: toInputDate(prevStart), pe: toInputDate(prevEnd) };
}

const STABLE_OR_USD = new Set(['USD', 'USDT', 'USDC', 'DAI', 'BUSD']);

function normalizeAccountCur(currency: string | undefined): string {
  return (currency?.trim() || 'ARS').toUpperCase();
}

function txMatchesAccountAndCurrency(
  tx: TxItem,
  accountFilter: string,
  currencyFilter: string
): boolean {
  if (accountFilter !== 'all' && tx.account?.name !== accountFilter) return false;
  const cur = normalizeAccountCur(tx.account?.currency || tx.currency);
  if (currencyFilter !== 'all' && cur !== currencyFilter) return false;
  return true;
}

/**
 * Convierte el monto de la transacción a ARS equivalente (dólar blue) cuando la vista mezcla monedas.
 * Alineado con el patrimonio: USD/stablecoins × cotización; ARS tal cual; BTC/ETH si hay precio ARS.
 */
function txAmountInArsBlue(
  tx: TxItem,
  usdToArsBlue: number,
  cryptoPriceArs?: { btc?: number; eth?: number }
): number {
  const raw = Math.abs(Number(tx.amount_in_account_currency ?? tx.amount ?? 0));
  const cur = normalizeAccountCur(tx.account?.currency || tx.currency);
  if (cur === 'ARS') return raw;
  if (usdToArsBlue > 0 && (cur === 'USD' || STABLE_OR_USD.has(cur))) {
    return raw * usdToArsBlue;
  }
  if (cur === 'BTC' && cryptoPriceArs?.btc && cryptoPriceArs.btc > 0) {
    return raw * cryptoPriceArs.btc;
  }
  if (cur === 'ETH' && cryptoPriceArs?.eth && cryptoPriceArs.eth > 0) {
    return raw * cryptoPriceArs.eth;
  }
  return raw;
}

function sumPoolForPeriodFiltered(
  pool: TxItem[],
  mode: AnalyzerMode,
  startDate: string,
  endDate: string,
  accountFilter: string,
  currencyFilter: string,
  convertToArsBlue: boolean,
  usdToArsBlue: number,
  cryptoPriceArs?: { btc?: number; eth?: number }
): number {
  return pool
    .filter((t) => t.type === mode && txInDateRange(t, startDate, endDate))
    .filter((t) => txMatchesAccountAndCurrency(t, accountFilter, currencyFilter))
    .reduce((sum, t) => {
      const amt =
        convertToArsBlue && usdToArsBlue > 0
          ? txAmountInArsBlue(t, usdToArsBlue, cryptoPriceArs)
          : Math.abs(Number(t.amount_in_account_currency || 0));
      return sum + amt;
    }, 0);
}

function computePrevTotalFromPool(
  pool: TxItem[],
  mode: AnalyzerMode,
  startDate: string,
  endDate: string,
  accountFilter: string,
  currencyFilter: string,
  convertToArsBlue: boolean,
  usdToArsBlue: number,
  cryptoPriceArs?: { btc?: number; eth?: number }
): number {
  const bounds = prevPeriodBounds(startDate, endDate);
  if (!bounds) return 0;
  return sumPoolForPeriodFiltered(
    pool,
    mode,
    bounds.ps,
    bounds.pe,
    accountFilter,
    currencyFilter,
    convertToArsBlue,
    usdToArsBlue,
    cryptoPriceArs
  );
}

/** Monto para gráficos: siempre positivo para gasto/ingreso. */
function txDisplayAmount(tx: TxItem): number {
  return Math.abs(Number(tx.amount_in_account_currency ?? tx.amount ?? 0));
}

function txAmountForAggregation(
  tx: TxItem,
  convertToArsBlue: boolean,
  usdToArsBlue: number,
  cryptoPriceArs?: { btc?: number; eth?: number }
): number {
  if (convertToArsBlue && usdToArsBlue > 0) {
    return txAmountInArsBlue(tx, usdToArsBlue, cryptoPriceArs);
  }
  return txDisplayAmount(tx);
}

function categoryLabel(tx: TxItem): string {
  return tx.category?.name || 'Sin categoría';
}

function formatTxRowDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function AnalyzerTotalSummary({
  total,
  currencyFilter,
  convertToArsBlue,
  variant,
}: {
  total: number;
  currencyFilter: string;
  convertToArsBlue: boolean;
  variant: 'overlay' | 'inline';
}) {
  const amountClass =
    variant === 'overlay'
      ? 'text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tabular-nums leading-tight'
      : 'text-xl font-bold text-slate-700 dark:text-slate-200 tabular-nums leading-tight';
  return (
    <div className="text-center px-3 max-w-[min(200px,78vw)] mx-auto">
      <div className="text-xs sm:text-sm text-slate-400">Total</div>
      <div className={amountClass}>${total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
      <div className="text-[10px] sm:text-[11px] text-slate-400 mt-1 leading-snug">
        {currencyFilter === 'all' && convertToArsBlue
          ? 'Equivalente en ARS (dólar blue; USD y stablecoins convertidos)'
          : currencyFilter === 'all'
            ? 'Sin cotización USD: montos sin convertir a pesos'
            : `Solo movimientos en ${currencyFilter}`}
      </div>
    </div>
  );
}

export interface SpendingAnalyzerProps {
  /** Preloaded movements (e.g. from dashboard RSC); avoids client fetch on first paint. */
  initialTransactions?: SpendingAnalyzerTxItem[];
  /** True when the server hit the fetch limit — older rows may be missing from the pool. */
  initialTransactionsTruncated?: boolean;
  /** USD→ARS (dólar blue). Con “Todas las monedas”, convierte ingresos/gastos en USD a pesos. */
  usdToArsBlue?: number;
  /** Precios en ARS por 1 unidad (CoinGecko/CriptoYa) para cuentas en BTC/ETH. */
  cryptoPriceArs?: { btc?: number; eth?: number };
}

export default function SpendingAnalyzer({
  initialTransactions,
  initialTransactionsTruncated = false,
  usdToArsBlue: usdToArsBlueProp,
  cryptoPriceArs: cryptoPriceArsProp,
}: SpendingAnalyzerProps = {}) {
  const [mode, setMode] = useState<AnalyzerMode>('expense');
  const [range, setRange] = useState<RangeType>('week');
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [customFrom, setCustomFrom] = useState(toInputDate(new Date()));
  const [customTo, setCustomTo] = useState(toInputDate(new Date()));
  const [loading, setLoading] = useState(() => initialTransactions === undefined);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TxItem[]>([]);
  /** Período anterior (solo ruta fetch sin pool inicial). */
  const [prevPeriodItems, setPrevPeriodItems] = useState<TxItem[]>([]);
  const [accountFilter, setAccountFilter] = useState<string>('all');
  /** 'all' = todas las monedas (general). */
  const [currencyFilter, setCurrencyFilter] = useState<string>('all');
  const [detailCategory, setDetailCategory] = useState<string | null>(null);
  const [fetchedUsdArs, setFetchedUsdArs] = useState<number | null>(null);
  const [fetchedCryptoArs, setFetchedCryptoArs] = useState<{ btc?: number; eth?: number } | undefined>();

  const effectiveUsdBlue = useMemo(() => {
    if (usdToArsBlueProp !== undefined && usdToArsBlueProp > 0) return usdToArsBlueProp;
    return fetchedUsdArs ?? 0;
  }, [usdToArsBlueProp, fetchedUsdArs]);

  const effectiveCryptoArs = useMemo(
    () => ({
      btc: cryptoPriceArsProp?.btc ?? fetchedCryptoArs?.btc,
      eth: cryptoPriceArsProp?.eth ?? fetchedCryptoArs?.eth,
    }),
    [cryptoPriceArsProp, fetchedCryptoArs]
  );

  /** Vista “todas las monedas”: sumar todo en ARS (dólar blue) para no mezclar USD con pesos. */
  const convertToArsBlue = currencyFilter === 'all' && effectiveUsdBlue > 0;

  useEffect(() => {
    if (usdToArsBlueProp !== undefined && usdToArsBlueProp > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/cotizaciones', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const sell = Number(data?.dolar?.blue?.sell) || 0;
        if (sell > 0) setFetchedUsdArs(sell);
        setFetchedCryptoArs({
          btc: Number(data?.crypto?.btc?.priceARS) || undefined,
          eth: Number(data?.crypto?.eth?.priceARS) || undefined,
        });
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [usdToArsBlueProp]);

  const { startDate, endDate } = useMemo(
    () => getRange(range, customFrom, customTo, anchorDate),
    [range, customFrom, customTo, anchorDate]
  );

  const periodLabel = useMemo(() => {
    const a = parseYmdLocal(startDate);
    const b = parseYmdLocal(endDate);
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
    if (startDate === endDate) return a.toLocaleDateString('es-AR');
    return `${a.toLocaleDateString('es-AR')} — ${b.toLocaleDateString('es-AR')}`;
  }, [startDate, endDate]);

  const availableAccounts = useMemo(() => {
    const arr = Array.from(new Set(items.map((i) => i.account?.name).filter(Boolean))) as string[];
    return arr.sort((x, y) => x.localeCompare(y, 'es', { sensitivity: 'base' }));
  }, [items]);

  const availableCurrencies = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) {
      const c = (i.account?.currency || i.currency || 'ARS').toUpperCase();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  useEffect(() => {
    if (accountFilter !== 'all' && !availableAccounts.includes(accountFilter)) {
      setAccountFilter('all');
    }
  }, [accountFilter, availableAccounts]);

  useEffect(() => {
    if (currencyFilter !== 'all' && !availableCurrencies.includes(currencyFilter)) {
      setCurrencyFilter('all');
    }
  }, [currencyFilter, availableCurrencies]);

  useEffect(() => {
    let cancelled = false;

    if (initialTransactions !== undefined) {
      setError(null);
      const filtered = filterPoolForPeriod(initialTransactions, mode, startDate, endDate);
      if (!cancelled) {
        setItems(filtered);
        setPrevPeriodItems([]);
        setLoading(false);
      }
      return () => {
        cancelled = true;
      };
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/transactions?type=${mode}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&limit=2000`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('No se pudo cargar el analizador');
        const data = await res.json();
        if (!cancelled) setItems(Array.isArray(data) ? data : []);

        const start = parseYmdLocal(startDate);
        const end = parseYmdLocal(endDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          if (!cancelled) setPrevPeriodItems([]);
        } else {
          const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
          const prevEnd = addDays(start, -1);
          const prevStart = addDays(prevEnd, -(days - 1));
          const prevUrl = `/api/transactions?type=${mode}&startDate=${encodeURIComponent(toInputDate(prevStart))}&endDate=${encodeURIComponent(toInputDate(prevEnd))}&limit=2000`;
          const prevRes = await fetch(prevUrl, { cache: 'no-store' });
          const prevData = prevRes.ok ? await prevRes.json() : [];
          if (!cancelled) setPrevPeriodItems(Array.isArray(prevData) ? prevData : []);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Error cargando datos';
        if (!cancelled) setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, mode, initialTransactions]);

  const filteredItems = useMemo(() => {
    return items.filter((tx) => txMatchesAccountAndCurrency(tx, accountFilter, currencyFilter));
  }, [items, accountFilter, currencyFilter]);

  const prevTotal = useMemo(() => {
    if (initialTransactions !== undefined) {
      return computePrevTotalFromPool(
        initialTransactions,
        mode,
        startDate,
        endDate,
        accountFilter,
        currencyFilter,
        convertToArsBlue,
        effectiveUsdBlue,
        effectiveCryptoArs
      );
    }
    return prevPeriodItems
      .filter((t) => txMatchesAccountAndCurrency(t, accountFilter, currencyFilter))
      .reduce(
        (sum, t) => sum + txAmountForAggregation(t, convertToArsBlue, effectiveUsdBlue, effectiveCryptoArs),
        0
      );
  }, [
    initialTransactions,
    mode,
    startDate,
    endDate,
    accountFilter,
    currencyFilter,
    prevPeriodItems,
    convertToArsBlue,
    effectiveUsdBlue,
    effectiveCryptoArs,
  ]);

  const { total, slices } = useMemo(() => {
    const map = new Map<string, { icon: string; amount: number }>();
    let totalAmount = 0;

    for (const tx of filteredItems) {
      const name = tx.category?.name || 'Sin categoría';
      const icon = tx.category?.icon || '🔁';
      const amount = txAmountForAggregation(tx, convertToArsBlue, effectiveUsdBlue, effectiveCryptoArs);
      if (!Number.isFinite(amount) || amount === 0) continue;
      totalAmount += amount;
      const prev = map.get(name) || { icon, amount: 0 };
      prev.amount += amount;
      map.set(name, prev);
    }

    const out: CategorySlice[] = Array.from(map.entries())
      .map(([name, v], i) => ({
        name,
        icon: v.icon,
        amount: v.amount,
        percent: totalAmount > 0 ? (v.amount / totalAmount) * 100 : 0,
        color: COLORS[i % COLORS.length],
      }))
      .sort((a, b) => b.amount - a.amount);

    return { total: totalAmount, slices: out };
  }, [filteredItems, convertToArsBlue, effectiveUsdBlue, effectiveCryptoArs]);

  const txCount = filteredItems.length;
  const avgTicket = txCount > 0 ? total / txCount : 0;
  const maxTx = useMemo(() => {
    if (filteredItems.length === 0) return null;
    return [...filteredItems].sort(
      (a, b) =>
        txAmountForAggregation(b, convertToArsBlue, effectiveUsdBlue, effectiveCryptoArs) -
        txAmountForAggregation(a, convertToArsBlue, effectiveUsdBlue, effectiveCryptoArs)
    )[0];
  }, [filteredItems, convertToArsBlue, effectiveUsdBlue, effectiveCryptoArs]);
  const variationPct =
    prevTotal > 0 && Number.isFinite(total) ? ((total - prevTotal) / prevTotal) * 100 : null;
  const displaySlices = useMemo(() => {
    if (slices.length <= MAX_PIE_SLICES) return slices;
    const head = slices.slice(0, MAX_PIE_SLICES - 1);
    const tail = slices.slice(MAX_PIE_SLICES - 1);
    const tailAmount = tail.reduce((sum, s) => sum + s.amount, 0);
    const tailPercent = tail.reduce((sum, s) => sum + s.percent, 0);
    return [
      ...head,
      {
        name: 'Otros',
        icon: '🧩',
        amount: tailAmount,
        percent: tailPercent,
        color: '#94A3B8',
      },
    ];
  }, [slices]);

  const tailCategoryNames = useMemo(() => {
    if (slices.length <= MAX_PIE_SLICES) return new Set<string>();
    return new Set(slices.slice(MAX_PIE_SLICES - 1).map((s) => s.name));
  }, [slices]);

  const detailTransactions = useMemo(() => {
    if (!detailCategory) return [];
    const list =
      detailCategory === '__others__'
        ? filteredItems.filter((tx) => tailCategoryNames.has(categoryLabel(tx)))
        : filteredItems.filter((tx) => categoryLabel(tx) === detailCategory);
    return [...list].sort(
      (a, b) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime()
    );
  }, [detailCategory, filteredItems, tailCategoryNames]);

  useEffect(() => {
    if (!detailCategory) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailCategory(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailCategory]);

  const openCategoryDetail = useCallback((sliceName: string) => {
    setDetailCategory(sliceName === 'Otros' ? '__others__' : sliceName);
  }, []);

  const movePeriod = useCallback((direction: -1 | 1) => {
    if (range === 'custom') return;
    setAnchorDate((prev) => {
      const d = new Date(prev);
      if (range === 'day') d.setDate(d.getDate() + direction);
      else if (range === 'week') d.setDate(d.getDate() + direction * 7);
      else if (range === 'month') d.setMonth(d.getMonth() + direction);
      else if (range === 'year') d.setFullYear(d.getFullYear() + direction);
      return d;
    });
  }, [range]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Analizador de gastos</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-xl">
            Vista general: se suman <strong>todas las cuentas</strong>; con “Todas las monedas” el total se expresa en{' '}
            <strong>pesos equivalentes (dólar blue)</strong> para incluir ingresos en USD. Filtrá por moneda o cuenta si necesitás
            ver solo una moneda. Tocá una categoría para ver los movimientos del período.
          </p>
          {initialTransactionsTruncated && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
              Se muestran los últimos movimientos cargados; períodos muy antiguos pueden estar incompletos.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {range !== 'custom' && (
            <>
              <button onClick={() => movePeriod(-1)} className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs">‹</button>
              <button onClick={() => movePeriod(1)} className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-xs">›</button>
            </>
          )}
          <span className="text-xs text-slate-500">{periodLabel}</span>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setMode('expense')}
          className={`px-3 py-1.5 rounded-lg text-sm ${mode === 'expense' ? 'bg-red-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
        >
          Gastos
        </button>
        <button
          onClick={() => setMode('income')}
          className={`px-3 py-1.5 rounded-lg text-sm ${mode === 'income' ? 'bg-green-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
        >
          Ingresos
        </button>
      </div>

      <div className="flex gap-2 flex-wrap mb-3">
        {[
          { id: 'day', label: 'Día' },
          { id: 'week', label: 'Semana' },
          { id: 'month', label: 'Mes' },
          { id: 'year', label: 'Año' },
          { id: 'custom', label: 'Período' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setRange(t.id as RangeType)}
            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
              range === t.id
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-transparent'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {range === 'custom' && (
        <div className="grid grid-cols-2 gap-2 mb-3">
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="input" />
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="input" />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Moneda (opcional)</span>
          <select
            value={currencyFilter}
            onChange={(e) => setCurrencyFilter(e.target.value)}
            className="input"
          >
            <option value="all">Todas las monedas</option>
            {availableCurrencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Cuenta (opcional)</span>
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="input">
            <option value="all">Todas las cuentas</option>
            {availableAccounts.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <div className="rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs">
          <div className="text-slate-500">Movimientos</div>
          <div className="font-semibold text-slate-700 dark:text-slate-200">{txCount}</div>
        </div>
        <div className="rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs">
          <div className="text-slate-500">Vs período anterior</div>
          <div
            className={`font-semibold ${
              variationPct === null
                ? 'text-slate-500 dark:text-slate-400'
                : mode === 'expense'
                  ? variationPct >= 0
                    ? 'text-red-500'
                    : 'text-green-500'
                  : variationPct >= 0
                    ? 'text-green-500'
                    : 'text-red-500'
            }`}
          >
            {variationPct === null
              ? 'N/D'
              : `${variationPct >= 0 ? '+' : ''}${variationPct.toFixed(1)}%`}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-64 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
      ) : error ? (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">{error}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="relative bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
            {displaySlices.length === 0 ? (
              <div className="min-h-[256px] flex flex-col items-center justify-center gap-4 text-center px-2 py-4 sm:py-0">
                <p className="text-slate-400 dark:text-slate-500 text-sm leading-relaxed">
                  {mode === 'expense'
                    ? 'No hay gastos en este período con los filtros actuales.'
                    : 'No hay ingresos en este período con los filtros actuales.'}
                </p>
                <AnalyzerTotalSummary
                  total={total}
                  currencyFilter={currencyFilter}
                  convertToArsBlue={convertToArsBlue}
                  variant="inline"
                />
              </div>
            ) : (
              <>
                <div className="h-64 min-h-[256px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%" minHeight={256}>
                    <PieChart>
                      <Pie
                        data={displaySlices}
                        dataKey="amount"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={92}
                        paddingAngle={1.5}
                        isAnimationActive={false}
                        cursor="pointer"
                        onClick={(_, index) => {
                          const s = displaySlices[index];
                          if (s) openCategoryDetail(s.name);
                        }}
                      >
                        {displaySlices.map((s, i) => (
                          <Cell key={`${s.name}-${i}`} fill={s.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number | string) =>
                          typeof v === 'number'
                            ? `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
                            : String(v)
                        }
                        contentStyle={{ borderRadius: 8 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <AnalyzerTotalSummary
                    total={total}
                    currencyFilter={currencyFilter}
                    convertToArsBlue={convertToArsBlue}
                    variant="overlay"
                  />
                </div>
              </>
            )}
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2 mb-1">
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
                <div className="text-slate-500">Ticket promedio</div>
                <div className="font-semibold text-slate-700 dark:text-slate-200">
                  ${avgTicket.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
                <div className="text-slate-500">Ticket máximo</div>
                <div className="font-semibold text-slate-700 dark:text-slate-200">
                  $
                  {maxTx
                    ? txAmountForAggregation(
                        maxTx,
                        convertToArsBlue,
                        effectiveUsdBlue,
                        effectiveCryptoArs
                      ).toLocaleString('es-AR', { maximumFractionDigits: 0 })
                    : '0'}
                </div>
              </div>
            </div>

            {displaySlices.slice(0, 8).map((s, idx) => (
              <button
                type="button"
                key={`${s.name}-${idx}`}
                onClick={() => openCategoryDetail(s.name)}
                className="w-full text-left flex items-center justify-between p-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700/80 transition-colors cursor-pointer border border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg inline-flex items-center justify-center">
                    <CategoryIcon icon={s.icon} className="w-4 h-4" />
                  </span>
                  <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{s.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{s.percent.toFixed(0)}%</div>
                  <div className="text-sm text-slate-500">${s.amount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
                </div>
              </button>
            ))}
            {displaySlices.length === 0 && (
              <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-500">No hay categorías para mostrar.</div>
            )}
          </div>
        </div>
      )}

      {detailCategory && (
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50"
          role="presentation"
          onClick={() => setDetailCategory(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="analyzer-detail-title"
            className="bg-white dark:bg-slate-900 w-full sm:max-w-lg max-h-[88vh] overflow-hidden rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
              <h4 id="analyzer-detail-title" className="font-semibold text-slate-800 dark:text-slate-100 pr-2">
                {detailCategory === '__others__' ? 'Otros (varias categorías)' : detailCategory}
              </h4>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => setDetailCategory(null)}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500 px-4 pb-2">{periodLabel}</p>
            <ul className="overflow-y-auto max-h-[min(60vh,480px)] px-4 pb-4 space-y-3">
              {detailTransactions.map((tx) => (
                <li
                  key={tx.id}
                  className="flex justify-between gap-3 text-sm border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="text-slate-500 text-xs">{formatTxRowDate(tx.transaction_date)}</div>
                    <div className="text-slate-800 dark:text-slate-200 truncate">
                      {tx.description?.trim() || 'Sin descripción'}
                    </div>
                    <div className="text-xs text-slate-400 truncate">
                      {tx.account?.name ?? 'Sin cuenta'} · {(tx.account?.currency || tx.currency || '—').toUpperCase()}
                    </div>
                  </div>
                  <div className="font-semibold text-slate-700 dark:text-slate-200 shrink-0 tabular-nums">
                    ${txDisplayAmount(tx).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                  </div>
                </li>
              ))}
            </ul>
            {detailTransactions.length === 0 && (
              <p className="text-sm text-slate-500 px-4 pb-4">No hay movimientos en esta categoría para el período y filtros actuales.</p>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

