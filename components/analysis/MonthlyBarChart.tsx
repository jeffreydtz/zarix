'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { motion } from 'framer-motion';
import type { MonthlyData } from '@/lib/services/analytics';

interface Props {
  data: MonthlyData[];
}

export default function MonthlyBarChart({ data }: Props) {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="card p-6"
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

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis 
              dataKey="monthLabel" 
              tick={{ fontSize: 12 }}
              stroke="#9CA3AF"
            />
            <YAxis 
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              tick={{ fontSize: 12 }}
              stroke="#9CA3AF"
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                `$${value.toLocaleString('es-AR')}`,
                name === 'expenses' ? 'Gastos' : name === 'income' ? 'Ingresos' : 'Balance'
              ]}
              contentStyle={{
                backgroundColor: 'rgba(15, 23, 42, 0.92)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '10px',
                color: '#F8FAFC'
              }}
            />
            <Legend 
              formatter={(value) => value === 'expenses' ? 'Gastos' : value === 'income' ? 'Ingresos' : 'Balance'}
            />
            <Bar dataKey="expenses" fill="#EF4444" radius={[4, 4, 0, 0]} name="expenses" />
            <Bar dataKey="income" fill="#22C55E" radius={[4, 4, 0, 0]} name="income" />
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
