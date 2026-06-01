'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { motion, useReducedMotion } from 'framer-motion';
import { useState } from 'react';
import type { CategoryBreakdown } from '@/lib/services/analytics';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';
import { animMs } from '@/lib/chart-theme';
import ChartTooltip from '@/components/ui/ChartTooltip';

interface Props {
  data: CategoryBreakdown[];
  title: string;
}

export default function CategoryDonut({ data, title }: Props) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [activeName, setActiveName] = useState<string | null>(null);

  if (data.length === 0) {
    return (
      <div className="card p-6">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <div className="h-64 flex items-center justify-center text-slate-500">
          No hay datos para mostrar
        </div>
      </div>
    );
  }

  const total = data.reduce((sum, d) => sum + d.amount, 0);
  const topCategory = data[0];
  const activeCategory = data.find((cat) => cat.name === activeName) ?? topCategory;

  return (
    <motion.div
      initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={maybeReduceTransition(shouldReduceMotion, motionTransition.smooth)}
      className="card card-spotlight p-6"
    >
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h3 className="text-lg font-semibold mb-1">{title}</h3>
          <p className="text-xs text-muted-foreground">Distribución por categoría en el período seleccionado.</p>
        </div>
        <span className="story-chip">Top: {topCategory.icon} {topCategory.name}</span>
      </div>
      
      <div className="relative h-64 chart-shell p-2.5">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius="62%"
              outerRadius="95%"
              paddingAngle={3}
              cornerRadius={6}
              dataKey="amount"
              nameKey="name"
              onMouseEnter={(_, idx) => setActiveName(data[idx]?.name ?? null)}
              onMouseLeave={() => setActiveName(null)}
              animationDuration={animMs(shouldReduceMotion, 750)}
            >
              {data.map((entry, index) => {
                const isActive = entry.name === activeCategory.name;
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.color}
                    stroke={isActive ? 'rgb(var(--surface-glass))' : 'transparent'}
                    strokeWidth={isActive ? 3 : 0}
                    style={{
                      filter: isActive ? 'brightness(1.08)' : 'none',
                      opacity: activeName && !isActive ? 0.55 : 1,
                      transition: 'opacity 0.2s, filter 0.2s',
                    }}
                  />
                );
              })}
            </Pie>
            <Tooltip
              content={
                <ChartTooltip
                  formatter={(value) => [`$${value.toLocaleString('es-AR')}`, 'Monto']}
                />
              }
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Label central: categoría en foco */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl leading-none">{activeCategory.icon}</span>
          <span className="mt-1 text-xs font-medium text-muted-foreground">{activeCategory.name}</span>
          <span className="text-sm font-semibold text-foreground zx-num">
            {activeCategory.percent.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="mt-4 rounded-control border border-border/75 bg-surface-soft/65 p-3">
        <p className="text-xs text-muted-foreground mb-1">Categoría en foco</p>
        <p className="font-semibold text-sm text-foreground">
          {activeCategory.icon} {activeCategory.name} concentra {activeCategory.percent.toFixed(1)}% (${activeCategory.amount.toLocaleString('es-AR')}).
        </p>
      </div>

      <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
        {data.map((cat, index) => (
          <motion.div
            key={cat.name}
            initial={{ opacity: 0, x: shouldReduceMotion ? 0 : -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={maybeReduceTransition(shouldReduceMotion, {
              ...motionTransition.smooth,
              delay: index * 0.04,
              duration: 0.25,
            })}
            className={`zx-panel flex items-center justify-between p-2 transition-colors ${
              cat.name === activeCategory.name ? 'border-primary/40 bg-primary/10' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: cat.color }}
              />
              <span className="text-lg">{cat.icon}</span>
              <span className="font-medium text-sm">{cat.name}</span>
              <span className="text-xs text-slate-500">({cat.count})</span>
            </div>
            <div className="text-right">
              <div className="font-semibold text-sm zx-num">
                ${cat.amount.toLocaleString('es-AR')}
              </div>
              <div className="text-xs text-slate-500">
                {cat.percent.toFixed(1)}%
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
        <div className="flex justify-between font-semibold zx-num">
          <span>Total</span>
          <span>${total.toLocaleString('es-AR')}</span>
        </div>
      </div>
    </motion.div>
  );
}
