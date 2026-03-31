'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion } from 'framer-motion';
import type { AccountBreakdown } from '@/lib/services/analytics';

interface Props {
  data: AccountBreakdown[];
}

export default function AccountBreakdownChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4">Gastos por Cuenta</h3>
        <div className="h-48 flex items-center justify-center text-slate-500">
          No hay datos para mostrar
        </div>
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.amount, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="card p-6"
    >
      <h3 className="text-lg font-semibold mb-4">Gastos por Cuenta</h3>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart 
            data={data} 
            layout="vertical"
            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          >
            <XAxis 
              type="number" 
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              tick={{ fontSize: 10 }}
              stroke="#9CA3AF"
            />
            <YAxis 
              type="category" 
              dataKey="name" 
              width={100}
              tick={{ fontSize: 11 }}
              stroke="#9CA3AF"
            />
            <Tooltip
              formatter={(value: number) => [`$${value.toLocaleString('es-AR')}`, 'Gastos']}
              contentStyle={{
                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                border: 'none',
                borderRadius: '8px',
                color: 'white'
              }}
            />
            <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 space-y-2">
        {data.slice(0, 3).map((acc, index) => (
          <div key={acc.name} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span>{acc.icon}</span>
              <span className="font-medium">{acc.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-semibold">${acc.amount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
              <span className="text-xs text-slate-500 w-12 text-right">({acc.percent.toFixed(0)}%)</span>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
