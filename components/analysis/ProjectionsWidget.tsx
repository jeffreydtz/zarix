'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';

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
  const shouldReduceMotion = useReducedMotion() ?? false;
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
      <div className="rounded-2xl border border-border bg-card p-5 animate-pulse">
        <div className="h-5 bg-secondary rounded w-1/3 mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-secondary rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!data || !data.hasData) {
    return data?.message ? <p role="status" className="card text-sm text-warning">{data.message}</p> : null;
  }

  const isPositive = data.trend === 'positive';
  const trendColor = isPositive ? 'text-success' : 'text-destructive';
  const trendBg = isPositive ? 'bg-success/10' : 'bg-destructive/10';

  const projections = [
    { label: '3 meses', value: data.projection3m, months: 3 },
    { label: '6 meses', value: data.projection6m, months: 6 },
    { label: '12 meses', value: data.projection12m, months: 12 },
  ];

  // Normalize for mini bar chart
  const maxVal = Math.max(...data.futureMonths.slice(0, 6).map((m) => Math.abs(m.projected)), 1);

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.1 })}
      className="rounded-2xl border border-border bg-card overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-info/10 flex items-center justify-center text-lg">
            📈
          </div>
          <div>
            <div className="font-bold text-foreground text-sm">
              Proyecciones
            </div>
            <div className="text-xs text-muted-foreground">
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
          <div className="rounded-xl bg-secondary p-3">
            <div className="text-xs text-muted-foreground mb-1">Ingreso promedio</div>
            <div className="font-bold text-foreground text-sm">
              ${data.avgIncome.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className="rounded-xl bg-secondary p-3">
            <div className="text-xs text-muted-foreground mb-1">Gasto promedio</div>
            <div className="font-bold text-foreground text-sm">
              ${data.avgExpense.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
            </div>
          </div>
          <div className={`rounded-xl p-3 ${trendBg}`}>
            <div className="text-xs text-muted-foreground mb-1">Tasa ahorro</div>
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
                initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={maybeReduceTransition(shouldReduceMotion, {
                  ...motionTransition.smooth,
                  delay: 0.08 + i * 0.06,
                  duration: 0.32,
                })}
                className="rounded-xl border border-border bg-secondary p-3 text-center"
              >
                <div className="text-xs text-muted-foreground mb-1.5 font-medium">
                  En {proj.label}
                </div>
                <div className={`font-bold text-base ${proj.value >= 0 ? 'text-foreground' : 'text-destructive'}`}>
                  ${Math.abs(proj.value).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </div>
                <div className={`text-xs mt-0.5 ${diffPos ? 'text-success' : 'text-destructive'}`}>
                  {diffPos ? '+' : '−'}${Math.abs(diff).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Mini bar chart — próximos 6 meses */}
        <div>
          <div className="text-xs text-muted-foreground mb-2 font-medium">
            Próximos 6 meses
          </div>
          <div className="flex items-end gap-1.5 h-14">
            {data.futureMonths.slice(0, 6).map((m, i) => {
              const height = Math.max(((Math.abs(m.projected) / maxVal) * 100), 8);
              const isNeg = m.projected < 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <motion.div
                    style={{ minHeight: 4, height: '100%', transformOrigin: '50% 100%' }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: height / 100 }}
                    transition={maybeReduceTransition(shouldReduceMotion, {
                      ...motionTransition.smooth,
                      duration: 0.45,
                      delay: 0.14 + i * 0.05,
                    })}
                    className={`w-full rounded-t-sm ${isNeg ? 'bg-destructive' : 'bg-info'}`}
                    title={`${m.month}: $${m.projected.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`}
                  />
                  <div className="text-[9px] text-muted-foreground leading-none truncate w-full text-center">
                    {m.month.split(' ')[0]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {!isPositive && (
          <div className="text-xs text-destructive bg-destructive/10 rounded-xl p-3">
            ⚠️ Con este ritmo de gastos tu patrimonio en ARS disminuye. Considerá reducir gastos o aumentar ingresos.
          </div>
        )}
      </div>
    </motion.div>
  );
}
