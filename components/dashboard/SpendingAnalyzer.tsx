'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

type RangeType = 'day' | 'week' | 'month' | 'year' | 'custom';
type AnalyzerMode = 'expense' | 'income';

interface TxItem {
  id: string;
  type: 'expense' | 'income' | 'transfer' | 'adjustment';
  amount: number;
  currency: string;
  amount_in_account_currency: number;
  category?: { name: string; icon: string } | null;
  account?: { name: string; currency: string } | null;
  transaction_date: string;
}

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
    start = customFrom || end;
    return { startDate: start, endDate: customTo || end };
  }

  return { startDate: start, endDate: end };
}

export default function SpendingAnalyzer() {
  const [mode, setMode] = useState<AnalyzerMode>('expense');
  const [range, setRange] = useState<RangeType>('week');
  const [anchorDate, setAnchorDate] = useState(new Date());
  const [customFrom, setCustomFrom] = useState(toInputDate(new Date()));
  const [customTo, setCustomTo] = useState(toInputDate(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TxItem[]>([]);
  const [prevTotal, setPrevTotal] = useState(0);
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const { startDate, endDate } = useMemo(
    () => getRange(range, customFrom, customTo, anchorDate),
    [range, customFrom, customTo, anchorDate]
  );

  const periodLabel = useMemo(() => {
    if (startDate === endDate) return new Date(startDate).toLocaleDateString('es-AR');
    return `${new Date(startDate).toLocaleDateString('es-AR')} - ${new Date(endDate).toLocaleDateString('es-AR')}`;
  }, [startDate, endDate]);

  const availableAccounts = useMemo(
    () => Array.from(new Set(items.map((i) => i.account?.name).filter(Boolean))) as string[],
    [items]
  );
  const availableCategories = useMemo(
    () => Array.from(new Set(items.map((i) => i.category?.name).filter(Boolean))) as string[],
    [items]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/transactions?type=${mode}&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&limit=2000`;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('No se pudo cargar el analizador');
        const data = await res.json();
        if (!cancelled) setItems(Array.isArray(data) ? data : []);

        // Previous period comparison
        const start = new Date(startDate);
        const end = new Date(endDate);
        const days = Math.max(1, Math.floor((end.getTime() - start.getTime()) / 86400000) + 1);
        const prevEnd = addDays(start, -1);
        const prevStart = addDays(prevEnd, -(days - 1));
        const prevUrl = `/api/transactions?type=${mode}&startDate=${encodeURIComponent(toInputDate(prevStart))}&endDate=${encodeURIComponent(toInputDate(prevEnd))}&limit=2000`;
        const prevRes = await fetch(prevUrl, { cache: 'no-store' });
        const prevData = prevRes.ok ? await prevRes.json() : [];
        const prevAmount = Array.isArray(prevData)
          ? prevData.reduce((sum, t) => sum + Number(t.amount_in_account_currency || 0), 0)
          : 0;
        if (!cancelled) setPrevTotal(prevAmount);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Error cargando datos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, mode]);

  const filteredItems = useMemo(() => {
    return items.filter((tx) => {
      const byAccount = accountFilter === 'all' || tx.account?.name === accountFilter;
      const byCategory = categoryFilter === 'all' || tx.category?.name === categoryFilter;
      return byAccount && byCategory;
    });
  }, [items, accountFilter, categoryFilter]);

  const { total, slices } = useMemo(() => {
    const map = new Map<string, { icon: string; amount: number }>();
    let totalAmount = 0;

    for (const tx of filteredItems) {
      const name = tx.category?.name || 'Sin categoría';
      const icon = tx.category?.icon || '🔁';
      const amount = Number(tx.amount_in_account_currency || 0);
      if (!amount) continue;
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
  }, [filteredItems]);

  const txCount = filteredItems.length;
  const avgTicket = txCount > 0 ? total / txCount : 0;
  const maxTx = useMemo(() => {
    if (filteredItems.length === 0) return null;
    return [...filteredItems].sort((a, b) => Number(b.amount_in_account_currency) - Number(a.amount_in_account_currency))[0];
  }, [filteredItems]);
  const variationPct = prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;

  const movePeriod = (direction: -1 | 1) => {
    if (range === 'custom') return;
    const d = new Date(anchorDate);
    if (range === 'day') d.setDate(d.getDate() + direction);
    else if (range === 'week') d.setDate(d.getDate() + direction * 7);
    else if (range === 'month') d.setMonth(d.getMonth() + direction);
    else if (range === 'year') d.setFullYear(d.getFullYear() + direction);
    setAnchorDate(d);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">Analizador de gastos</h3>
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="input">
          <option value="all">Todas las cuentas</option>
          {availableAccounts.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="input">
          <option value="all">Todas las categorías</option>
          {availableCategories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <div className="rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs">
          <div className="text-slate-500">Movimientos</div>
          <div className="font-semibold text-slate-700 dark:text-slate-200">{txCount}</div>
        </div>
        <div className="rounded-xl bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs">
          <div className="text-slate-500">Vs período anterior</div>
          <div className={`font-semibold ${variationPct >= 0 ? 'text-red-500' : 'text-green-500'}`}>
            {prevTotal > 0 ? `${variationPct >= 0 ? '+' : ''}${variationPct.toFixed(1)}%` : 'N/D'}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-64 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
      ) : error ? (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">{error}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="relative bg-slate-900 dark:bg-slate-800 rounded-2xl p-4">
            {slices.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-slate-400">Sin gastos en este período</div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={slices}
                      dataKey="amount"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={65}
                      outerRadius={105}
                      paddingAngle={2}
                    >
                      {slices.map((s) => (
                        <Cell key={s.name} fill={s.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v: number) => `$${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
                      contentStyle={{ background: '#0f172a', border: 'none', borderRadius: 8, color: '#fff' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <div className="text-sm text-slate-400">Total</div>
                <div className="text-3xl font-bold text-white">${total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
              </div>
            </div>
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
                  ${Number(maxTx?.amount_in_account_currency || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </div>
              </div>
            </div>

            {slices.slice(0, 8).map((s) => (
              <div key={s.name} className="flex items-center justify-between p-3 rounded-xl bg-slate-100 dark:bg-slate-800">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg">{s.icon}</span>
                  <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{s.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{s.percent.toFixed(0)}%</div>
                  <div className="text-sm text-slate-500">${s.amount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
                </div>
              </div>
            ))}
            {slices.length === 0 && (
              <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm text-slate-500">No hay categorías para mostrar.</div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

