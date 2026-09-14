'use client';

import { memo, useMemo } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import Amount from '@/components/ui/Amount';
import type { TopBudgetItem } from '@/lib/services/budget-summary';
import { motionVariants, maybeReduceTransition, motionTransition } from '@/lib/motion';

interface BudgetClusterProps {
  budgets: TopBudgetItem[];
}

function barColorClass(percentUsed: number): string {
  if (percentUsed > 100) return 'bg-destructive';
  if (percentUsed >= 75) return 'bg-warning';
  return 'bg-primary';
}

/** Días restantes del mes en curso, incluyendo hoy. */
function daysLeftInMonth(): number {
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  return Math.max(lastDay - today.getDate() + 1, 1);
}

function BudgetCluster({ budgets }: BudgetClusterProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;

  const availablePerDay = useMemo(() => {
    const totals = new Map<string, number>();
    for (const budget of budgets) {
      totals.set(budget.currency, (totals.get(budget.currency) ?? 0) + budget.remainingAmount);
    }
    return Array.from(totals, ([currency, amount]) => ({ currency, value: amount / daysLeftInMonth() }));
  }, [budgets]);

  return (
    <motion.div
      initial="hidden"
      variants={motionVariants.sectionEnter}
      animate="visible"
      transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.24 })}
      className="card"
    >
      <div className="flex items-center justify-between mb-5">
        <Link href="/budgets" className="text-lg font-semibold text-foreground hover:opacity-85">
          Presupuestos
        </Link>
        {budgets.length > 0 && (
          <Link href="/budgets" className="text-sm text-primary hover:opacity-85 font-medium">
            Ver todo
          </Link>
        )}
      </div>

      {budgets.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no cargaste presupuestos este mes.{' '}
          <Link href="/budgets" className="text-primary hover:opacity-85 font-medium">
            Crear presupuesto
          </Link>
        </p>
      ) : (
        <>
          <ul className="space-y-4">
            {budgets.map((budget, index) => {
              const percentClamped = Math.min(budget.percentUsed, 100);

              return (
                <motion.li
                  key={budget.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={maybeReduceTransition(shouldReduceMotion, {
                    ...motionTransition.smooth,
                    delay: 0.05 * index,
                  })}
                >
                  <Link href="/budgets" className="block group">
                    <div className="flex items-center justify-between gap-3 mb-1.5">
                      <span className="flex items-center gap-2 min-w-0 text-sm font-medium text-foreground">
                        <span aria-hidden="true">{budget.icon}</span>
                        <span className="truncate">{budget.name}</span>
                      </span>
                      <span className="shrink-0 text-sm text-foreground">
                        Te quedan{' '}
                        <Amount
                          value={budget.remainingAmount}
                          currency={budget.currency}
                          className="font-bold"
                        />{' '}
                        <span className="text-muted-foreground">
                          de <Amount value={budget.limitAmount} currency={budget.currency} />
                        </span>
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${barColorClass(budget.percentUsed)} transition-[width] duration-500`}
                        style={{ width: `${Math.max(percentClamped, 2)}%` }}
                      />
                    </div>
                  </Link>
                </motion.li>
              );
            })}
          </ul>

          <p className="mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
            Disponible por día (presupuestos mostrados):{' '}
            {availablePerDay.map((item, index) => <span key={item.currency}>
              {index > 0 ? ' · ' : ''}<Amount value={item.value} currency={item.currency} className="font-medium" />
            </span>)}
          </p>
        </>
      )}
    </motion.div>
  );
}

export default memo(BudgetCluster);
