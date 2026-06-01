'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { motion, useReducedMotion } from 'framer-motion';
import type { DailyData } from '@/lib/services/analytics';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';
import { axisProps, gridProps, chartColors, animMs } from '@/lib/chart-theme';
import ChartTooltip from '@/components/ui/ChartTooltip';

interface Props {
  data: DailyData[];
}

export default function CashFlowChart({ data }: Props) {
  const shouldReduceMotion = useReducedMotion() ?? false;

  if (data.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Flujo de Caja (30 días)</h3>
        <div className="h-64 flex items-center justify-center text-slate-500">
          No hay datos para mostrar
        </div>
      </div>
    );
  }

  const chartData = data.map(d => ({
    ...d,
    netFlow: d.income - d.expenses
  }));

  const totalExpenses = data.reduce((sum, d) => sum + d.expenses, 0);
  const totalIncome = data.reduce((sum, d) => sum + d.income, 0);
  const avgDaily = totalExpenses / data.length;
  const net = totalIncome - totalExpenses;

  const maxExpenseDay = data.reduce((max, d) => d.expenses > max.expenses ? d : max, data[0]);

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.12 })}
      className="card card-spotlight p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold">Flujo de Caja (últimos 30 días)</h3>
        <span className={`story-chip ${net >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-500 dark:text-red-300'}`}>
          Neto del período: {net >= 0 ? '+' : ''}${net.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </span>
      </div>

      <div className="h-64 chart-shell p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
            <defs>
              <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartColors.expense} stopOpacity={0.35}/>
                <stop offset="100%" stopColor={chartColors.expense} stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartColors.income} stopOpacity={0.35}/>
                <stop offset="100%" stopColor={chartColors.income} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis
              dataKey="dayLabel"
              {...axisProps}
              interval={4}
              dy={4}
            />
            <YAxis
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              {...axisProps}
              width={44}
            />
            <Tooltip
              cursor={{ stroke: 'rgb(148 163 184 / 0.4)', strokeWidth: 1 }}
              content={
                <ChartTooltip
                  formatter={(value, name) => [
                    `$${value.toLocaleString('es-AR')}`,
                    name === 'expenses' ? 'Gastos' : 'Ingresos',
                  ]}
                />
              }
            />
            <ReferenceLine
              y={avgDaily}
              stroke={chartColors.accent}
              strokeDasharray="5 5"
              label={{ value: 'Promedio', fill: chartColors.accent, fontSize: 10, position: 'insideTopRight' }}
            />
            <Area
              type="monotone"
              dataKey="expenses"
              stroke={chartColors.expense}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorExpenses)"
              name="expenses"
              activeDot={{ r: 4, strokeWidth: 0 }}
              animationDuration={animMs(shouldReduceMotion, 700)}
            />
            <Area
              type="monotone"
              dataKey="income"
              stroke={chartColors.income}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorIncome)"
              name="income"
              activeDot={{ r: 4, strokeWidth: 0 }}
              animationDuration={animMs(shouldReduceMotion, 620)}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div className="zx-kpi">
          <div className="text-slate-500 dark:text-slate-400">Total gastos</div>
          <div className="text-lg font-semibold text-red-600 dark:text-red-400 zx-num">
            ${totalExpenses.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="zx-kpi">
          <div className="text-slate-500 dark:text-slate-400">Total ingresos</div>
          <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400 zx-num">
            ${totalIncome.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="zx-kpi">
          <div className="text-slate-500 dark:text-slate-400">Día pico</div>
          <div className="text-lg font-semibold text-amber-600 dark:text-amber-400">
            {maxExpenseDay.dayLabel}
          </div>
          <div className="text-xs text-slate-500 zx-num">
            ${maxExpenseDay.expenses.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
