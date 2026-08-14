'use client';

import { memo } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import Amount from '@/components/ui/Amount';
import type { UpcomingItem } from '@/lib/services/upcoming';
import { motionVariants, maybeReduceTransition, motionTransition } from '@/lib/motion';

interface UpcomingRailProps {
  items: UpcomingItem[];
}

const HREF_BY_KIND: Record<UpcomingItem['kind'], string> = {
  recurring: '/recurring',
  card_close: '/accounts',
  card_due: '/accounts',
  maturity: '/investments',
};

const ICON_BY_KIND: Record<UpcomingItem['kind'], string> = {
  recurring: '🔁',
  card_close: '📅',
  card_due: '💳',
  maturity: '📈',
};

/** Días entre hoy (medianoche local) y una fecha YYYY-MM-DD. */
function daysUntil(dateISO: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateISO}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function dayBadgeLabel(daysLeft: number): string {
  if (daysLeft <= 0) return 'HOY';
  if (daysLeft === 1) return 'mañana';
  return `en ${daysLeft} días`;
}

function UpcomingRail({ items }: UpcomingRailProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;

  return (
    <motion.div
      initial="hidden"
      variants={motionVariants.sectionEnter}
      animate="visible"
      transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.2 })}
      className="card"
    >
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-foreground">Próximos vencimientos</h3>
        {items.length > 0 && (
          <Link href="/recurring" className="text-sm text-primary hover:opacity-85 font-medium">
            Ver todo
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tenés vencimientos próximos.{' '}
          <Link href="/recurring" className="text-primary hover:opacity-85 font-medium">
            Crear un gasto recurrente
          </Link>
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((item, index) => {
            const daysLeft = daysUntil(item.dateISO);
            const badgeClass = daysLeft <= 1 ? 'text-warning' : 'text-muted-foreground';

            return (
              <motion.li
                key={`${item.kind}-${item.label}-${item.dateISO}-${index}`}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={maybeReduceTransition(shouldReduceMotion, {
                  ...motionTransition.smooth,
                  delay: 0.05 * index,
                })}
              >
                <Link
                  href={HREF_BY_KIND[item.kind]}
                  className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-secondary transition-colors"
                >
                  <span
                    className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-secondary ${badgeClass}`}
                  >
                    {dayBadgeLabel(daysLeft)}
                  </span>
                  <span className="text-lg shrink-0" aria-hidden="true">
                    {ICON_BY_KIND[item.kind]}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm font-medium text-foreground">
                    {item.label}
                  </span>
                  {typeof item.amountARS === 'number' && (
                    <Amount
                      value={item.amountARS}
                      currency={item.currency === 'USD' ? 'USD' : 'ARS'}
                      className="shrink-0 text-sm font-semibold text-foreground"
                    />
                  )}
                </Link>
              </motion.li>
            );
          })}
        </ul>
      )}
    </motion.div>
  );
}

export default memo(UpcomingRail);
