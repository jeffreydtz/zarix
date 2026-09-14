'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import Amount from '@/components/ui/Amount';
import { motionVariants, maybeReduceTransition, motionTransition } from '@/lib/motion';
import type { MonthFlow } from '@/lib/services/month-flow';

interface MonthFlowCardProps {
  flow: MonthFlow;
}

const MONTH_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function MonthFlowCard({ flow }: MonthFlowCardProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const { incomeARS, spentARS, projectedSpendARS, excludedCurrencies } = flow;

  const balanceARS = incomeARS - spentARS;
  const spentOverIncome = spentARS > incomeARS;
  const projectedOverIncome = projectedSpendARS > incomeARS;

  // Escala común: la barra más larga (ingresos o gastos) llega al 100%.
  const maxARS = Math.max(incomeARS, spentARS, 1);
  const incomePct = Math.min(100, (incomeARS / maxARS) * 100);
  const spentPct = Math.min(100, (spentARS / maxARS) * 100);

  const monthLabel = MONTH_LABELS[flow.month ? Number(flow.month.slice(5, 7)) - 1 : new Date().getMonth()];

  return (
    <motion.div
      initial="hidden"
      variants={motionVariants.sectionEnter}
      animate="visible"
      transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.15 })}
      className="card p-0 overflow-hidden"
    >
      <Link
        href="/analysis"
        className="block p-5 hover:bg-accent/5 transition-colors"
      >
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Este mes</h3>
          <span className="text-sm text-muted-foreground">{monthLabel}</span>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Ingresos</span>
              <Amount value={incomeARS} decimals={0} className="text-foreground font-medium" />
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-success transition-[width] duration-500"
                style={{ width: `${incomePct}%` }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>Gastos</span>
              <Amount value={spentARS} decimals={0} className="text-foreground font-medium" />
            </div>
            <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  spentOverIncome ? 'bg-warning' : 'bg-primary'
                }`}
                style={{ width: `${spentPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-0.5">Balance del mes</p>
          <Amount
            value={balanceARS}
            decimals={0}
            prefix={balanceARS >= 0 ? '+' : ''}
            className={`text-2xl font-bold ${balanceARS >= 0 ? 'text-success' : 'text-destructive'}`}
          />
        </div>

        <p className={`text-xs mt-3 ${projectedOverIncome ? 'text-warning' : 'text-muted-foreground'}`}>
          Gasto estimado a fin de mes:{' '}
          <Amount value={projectedSpendARS} decimals={0} prefix="−" className="font-medium" />
        </p>

        <p className="text-[11px] text-muted-foreground mt-2">
          Gastos realizados + promedio variable de 14 días + próximas recurrencias. Es una estimación.
        </p>
        {excludedCurrencies.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-2">
            ⚠️ Sin cotización para {excludedCurrencies.join(', ')}: no están incluidos en los totales.
          </p>
        )}
      </Link>
    </motion.div>
  );
}
