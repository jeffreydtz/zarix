'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { motion } from 'framer-motion';
import type { DailyData } from '@/lib/services/analytics';

interface Props {
  data: DailyData[];
}

export default function CashFlowChart({ data }: Props) {
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

  const maxExpenseDay = data.reduce((max, d) => d.expenses > max.expenses ? d : max, data[0]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="card p-6"
    >
      <h3 className="text-lg font-semibold mb-4">Flujo de Caja (últimos 30 días)</h3>

      <div className="h-64">
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
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
            <XAxis 
              dataKey="dayLabel" 
              tick={{ fontSize: 10 }}
              interval={4}
              stroke="#9CA3AF"
            />
            <YAxis 
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              tick={{ fontSize: 10 }}
              stroke="#9CA3AF"
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                `$${value.toLocaleString('es-AR')}`,
                name === 'expenses' ? 'Gastos' : 'Ingresos'
              ]}
              contentStyle={{
                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                border: 'none',
                borderRadius: '8px',
                color: 'white'
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
            />
            <Area 
              type="monotone" 
              dataKey="income" 
              stroke="#22C55E" 
              fillOpacity={1}
              fill="url(#colorIncome)"
              name="income"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
          <div className="text-slate-500 dark:text-slate-400">Total gastos</div>
          <div className="text-lg font-semibold text-red-600 dark:text-red-400">
            ${totalExpenses.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
          <div className="text-slate-500 dark:text-slate-400">Total ingresos</div>
          <div className="text-lg font-semibold text-green-600 dark:text-green-400">
            ${totalIncome.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
        </div>
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
          <div className="text-slate-500 dark:text-slate-400">Día pico</div>
          <div className="text-lg font-semibold text-amber-600 dark:text-amber-400">
            {maxExpenseDay.dayLabel}
          </div>
          <div className="text-xs text-slate-500">
            ${maxExpenseDay.expenses.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
