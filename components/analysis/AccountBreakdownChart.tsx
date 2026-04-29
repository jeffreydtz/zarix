'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion, useReducedMotion } from 'framer-motion';
import type { AccountBreakdown } from '@/lib/services/analytics';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';

interface Props {
  data: AccountBreakdown[];
}

export default function AccountBreakdownChart({ data }: Props) {
  const shouldReduceMotion = useReducedMotion() ?? false;

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
  const topAccount = data[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.18 })}
      className="card card-spotlight p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h3 className="text-lg font-semibold">Gastos por Cuenta</h3>
        <span className="story-chip">Cuenta dominante: {topAccount.icon} {topAccount.name} ({topAccount.percent.toFixed(0)}%)</span>
      </div>

      <div className="h-48 chart-shell p-2">
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
              stroke="rgb(148 163 184 / 0.85)"
            />
            <YAxis 
              type="category" 
              dataKey="name" 
              width={100}
              tick={{ fontSize: 11 }}
              stroke="rgb(148 163 184 / 0.85)"
            />
            <Tooltip
              formatter={(value: number) => [`$${value.toLocaleString('es-AR')}`, 'Gastos']}
              contentStyle={{
                backgroundColor: 'rgba(10, 12, 17, 0.95)',
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '12px',
                color: '#F8FAFC',
              }}
            />
            <Bar dataKey="amount" radius={[0, 6, 6, 0]} animationDuration={shouldReduceMotion ? 0 : 650}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 space-y-2">
        {data.slice(0, 3).map((acc, index) => (
          <div key={acc.name} className="flex items-center justify-between text-sm rounded-control px-2 py-1.5 hover:bg-surface-soft/70 transition-colors">
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
