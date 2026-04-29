'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { motion, useReducedMotion } from 'framer-motion';
import type { DailyData } from '@/lib/services/analytics';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';

interface Props {
  data: DailyData[];
}

export default function CashFlowChart({ data }: Props) {
  const shouldReduceMotion = useReducedMotion();

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
          Neto del periodo: {net >= 0 ? '+' : ''}${net.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </span>
      </div>

      <div className="h-64 chart-shell p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <defs>
              <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#22C55E" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="4 4" stroke="rgb(148 163 184 / 0.25)" />
            <XAxis 
              dataKey="dayLabel" 
              tick={{ fontSize: 10 }}
              interval={4}
              stroke="rgb(148 163 184 / 0.85)"
            />
            <YAxis 
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              tick={{ fontSize: 10 }}
              stroke="rgb(148 163 184 / 0.85)"
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                `$${value.toLocaleString('es-AR')}`,
                name === 'expenses' ? 'Gastos' : 'Ingresos'
              ]}
              contentStyle={{
                backgroundColor: 'rgba(10, 12, 17, 0.95)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '12px',
                color: '#F8FAFC',
              }}
            />
            <ReferenceLine 
              y={avgDaily} 
              stroke="#F59E0B" 
              strokeDasharray="5 5"
              label={{ value: 'Promedio', fill: '#F59E0B', fontSize: 10 }}
            />
            <Area 
              type="monotone" 
              dataKey="expenses" 
              stroke="#EF4444" 
              fillOpacity={1}
              fill="url(#colorExpenses)"
              name="expenses"
              animationDuration={shouldReduceMotion ? 0 : 680}
            />
            <Area 
              type="monotone" 
              dataKey="income" 
              stroke="#22C55E" 
              fillOpacity={1}
              fill="url(#colorIncome)"
              name="income"
              animationDuration={shouldReduceMotion ? 0 : 620}
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
