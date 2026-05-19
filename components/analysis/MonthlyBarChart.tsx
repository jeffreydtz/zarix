'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { motion, useReducedMotion } from 'framer-motion';
import type { MonthlyData } from '@/lib/services/analytics';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';
import { axisProps, gridProps, chartColors, animMs } from '@/lib/chart-theme';
import ChartTooltip from '@/components/ui/ChartTooltip';

interface Props {
  data: MonthlyData[];
}

export default function MonthlyBarChart({ data }: Props) {
  const shouldReduceMotion = useReducedMotion() ?? false;

  if (data.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Evolución Mensual</h3>
        <div className="h-64 flex items-center justify-center text-slate-500">
          No hay datos para mostrar
        </div>
      </div>
    );
  }

  const avgExpenses = data.reduce((sum, d) => sum + d.expenses, 0) / data.length;
  const avgIncome = data.reduce((sum, d) => sum + d.income, 0) / data.length;
  const currentMonth = data[data.length - 1];
  const previousMonth = data.length > 1 ? data[data.length - 2] : null;

  const expensesDiff = previousMonth 
    ? ((currentMonth.expenses - previousMonth.expenses) / previousMonth.expenses) * 100 
    : 0;
  const balanceTrend = currentMonth.income - currentMonth.expenses;

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.08 })}
      className="card card-spotlight p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Evolución Mensual</h3>
        {previousMonth && (
          <div className={`text-sm px-2 py-1 rounded-full zx-num ${
            expensesDiff <= 0 
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            {expensesDiff >= 0 ? '+' : ''}{expensesDiff.toFixed(1)}% vs mes anterior
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <span className="story-chip">Promedio gasto: ${avgExpenses.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
        <span className="story-chip">Promedio ingreso: ${avgIncome.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
        <span className={`story-chip ${balanceTrend >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-500 dark:text-red-300'}`}>
          Balance actual: {balanceTrend >= 0 ? '+' : ''}${balanceTrend.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </span>
      </div>

      <div className="h-72 chart-shell p-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 4 }} barGap={4}>
            <defs>
              <linearGradient id="barExpenses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartColors.expense} stopOpacity={0.95} />
                <stop offset="100%" stopColor={chartColors.expense} stopOpacity={0.55} />
              </linearGradient>
              <linearGradient id="barIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartColors.income} stopOpacity={0.95} />
                <stop offset="100%" stopColor={chartColors.income} stopOpacity={0.55} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="monthLabel" {...axisProps} dy={4} />
            <YAxis
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              {...axisProps}
              width={44}
            />
            <Tooltip
              cursor={{ fill: 'rgb(148 163 184 / 0.08)' }}
              content={
                <ChartTooltip
                  formatter={(value, name) => [
                    `$${value.toLocaleString('es-AR')}`,
                    name === 'expenses' ? 'Gastos' : name === 'income' ? 'Ingresos' : 'Balance',
                  ]}
                />
              }
            />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(value) => value === 'expenses' ? 'Gastos' : value === 'income' ? 'Ingresos' : 'Balance'}
            />
            <Bar dataKey="expenses" fill="url(#barExpenses)" radius={[6, 6, 0, 0]} maxBarSize={48} name="expenses" animationDuration={animMs(shouldReduceMotion, 650)} />
            <Bar dataKey="income" fill="url(#barIncome)" radius={[6, 6, 0, 0]} maxBarSize={48} name="income" animationDuration={animMs(shouldReduceMotion, 700)} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div className="zx-kpi">
          <div className="text-slate-500">Promedio gastos (6 meses)</div>
          <div className="text-lg font-semibold text-red-500 zx-num">
            ${avgExpenses.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="zx-kpi">
          <div className="text-slate-500">Promedio ingresos (6 meses)</div>
          <div className="text-lg font-semibold text-emerald-500 zx-num">
            ${avgIncome.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
