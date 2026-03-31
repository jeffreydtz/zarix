'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface ProjectionData {
  hasData: boolean;
  message?: string;
  avgIncome: number;
  avgExpense: number;
  avgSavings: number;
  savingsRate: number;
  currentBalance: number;
  projection3m: number;
  projection6m: number;
  projection12m: number;
  monthsAnalyzed: number;
  trend: 'positive' | 'negative';
  futureMonths: Array<{ month: string; projected: number }>;
}

export default function ProjectionsWidget() {
  const [data, setData] = useState<ProjectionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/ai/projections')
      .then((r) => r.json())
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 animate-pulse">
        <div className="h-5 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-100 dark:bg-slate-700 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || !data.hasData) return null;

  const isPositive = data.trend === 'positive';
  const trendColor = isPositive
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-red-500 dark:text-red-400';
  const trendBg = isPositive
    ? 'bg-emerald-50 dark:bg-emerald-900/20'
    : 'bg-red-50 dark:bg-red-900/20';

  const projections = [
    { label: '3 meses', value: data.projection3m, months: 3 },
    { label: '6 meses', value: data.projection6m, months: 6 },
    { label: '12 meses', value: data.projection12m, months: 12 },
  ];

  // Normalize for mini bar chart
  const maxVal = Math.max(...data.futureMonths.slice(0, 6).map((m) => Math.abs(m.projected)), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-lg">
            📈
          </div>
          <div>
            <div className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              Proyecciones
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Basado en los últimos {data.monthsAnalyzed} {data.monthsAnalyzed === 1 ? 'mes' : 'meses'}
            </div>
          </div>
        </div>
        <div className={`text-xs font-semibold px-2.5 py-1 rounded-full ${trendBg} ${trendColor}`}>
          {isPositive ? `+$${data.avgSavings.toLocaleString('es-AR', { maximumFractionDigits: 0 })}/mes` : `−$${Math.abs(data.avgSavings).toLocaleString('es-AR', { maximumFractionDigits: 0 })}/mes`}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Avg stats */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-700/50 p-3">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Ingreso promedio</div>
            <div className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              ${data.avgIncome.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-700/50 p-3">
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Gasto promedio</div>
            <div className="font-bold text-slate-800 dark:text-slate-100 text-sm">
              ${data.avgExpense.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className={`rounded-xl p-3 ${trendBg}`}>
            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">Tasa ahorro</div>
            <div className={`font-bold text-sm ${trendColor}`}>
              {data.savingsRate.toFixed(1)}%
            </div>
          </div>
        </div>

        {/* Projection cards */}
        <div className="grid grid-cols-3 gap-3">
          {projections.map((proj, i) => {
            const diff = proj.value - data.currentBalance;
            const diffPos = diff >= 0;
            return (
              <motion.div
                key={proj.months}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 + i * 0.08 }}
                className="rounded-xl border border-slate-100 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/40 p-3 text-center"
              >
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1.5 font-medium">
                  En {proj.label}
                </div>
                <div className={`font-bold text-base ${proj.value >= 0 ? 'text-slate-800 dark:text-slate-100' : 'text-red-500'}`}>
                  ${Math.abs(proj.value).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </div>
                <div className={`text-xs mt-0.5 ${diffPos ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                  {diffPos ? '+' : '−'}${Math.abs(diff).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Mini bar chart — próximos 6 meses */}
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-2 font-medium">
            Próximos 6 meses
          </div>
          <div className="flex items-end gap-1.5 h-14">
            {data.futureMonths.slice(0, 6).map((m, i) => {
              const height = Math.max(((Math.abs(m.projected) / maxVal) * 100), 8);
              const isNeg = m.projected < 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{ duration: 0.6, delay: 0.2 + i * 0.06, ease: 'easeOut' }}
                    className={`w-full rounded-t-sm ${isNeg ? 'bg-red-400' : 'bg-blue-400 dark:bg-blue-500'}`}
                    style={{ minHeight: 4 }}
                    title={`${m.month}: $${m.projected.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
                  />
                  <div className="text-[9px] text-slate-400 leading-none truncate w-full text-center">
                    {m.month.split(' ')[0]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {!isPositive && (
          <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
            ⚠️ Con este ritmo de gastos tu patrimonio en ARS disminuye. Considerá reducir gastos o aumentar ingresos.
          </div>
        )}
      </div>
    </motion.div>
  );
}
