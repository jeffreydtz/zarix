'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import type { AccountWithBalance } from '@/lib/services/accounts';
import AccountBalanceEquivalents from '@/components/accounts/AccountBalanceEquivalents';
import ProgressBar from '@/components/ui/ProgressBar';
import AnimatedNumber from '@/components/ui/AnimatedNumber';

interface CreditCardsWidgetProps {
  accounts: AccountWithBalance[];
}

function CreditCardsWidget({ accounts }: CreditCardsWidgetProps) {
  const creditCards = accounts.filter(acc => acc.type === 'credit_card' && acc.credit_limit);

  if (creditCards.length === 0) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className="card"
    >
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-slate-200">
        <span>💳</span>
        <span>Resumen de Tarjetas</span>
      </h3>
      <div className="space-y-4">
        {creditCards.map((card, index) => {
          const used = Math.abs(card.balance);
          const limit = card.credit_limit || 0;
          const utilization = limit > 0 ? (used / limit) * 100 : 0;
          const available = limit - used;

          return (
            <motion.div 
              key={card.id} 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              className="p-4 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-750 border border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <motion.span 
                    className="text-3xl"
                    whileHover={{ scale: 1.1 }}
                  >
                    {card.icon || '💳'}
                  </motion.span>
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-200">{card.name}</div>
                    {card.last_4_digits && (
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        •••• {card.last_4_digits}
                      </div>
                    )}
                  </div>
                </div>
                <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
                  utilization > 80 
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                    : utilization > 50 
                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300'
                    : 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                }`}>
                  {utilization.toFixed(0)}%
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Usado</p>
                  <p className="font-bold text-slate-800 dark:text-slate-200">
                    <AnimatedNumber value={used} prefix="$" decimals={0} />
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Disponible</p>
                  <p className="font-bold text-green-600 dark:text-green-400">
                    <AnimatedNumber value={available} prefix="$" decimals={0} />
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-0.5">Límite</p>
                  <p className="font-semibold text-slate-600 dark:text-slate-300">
                    <AnimatedNumber value={limit} prefix="$" decimals={0} />
                  </p>
                </div>
              </div>

              {used > 1e-8 && (
                <>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Importes en {card.currency}. Equivalente aproximado:
                  </p>
                  <AccountBalanceEquivalents account={card} />
                </>
              )}

              <ProgressBar value={utilization} max={100} height="h-2" />

              {(card.closing_day || card.due_day) && (
                <div className="flex gap-4 mt-4 pt-3 border-t border-slate-200 dark:border-slate-600">
                  {card.closing_day && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate-400">📅</span>
                      <span className="text-slate-500 dark:text-slate-400">Cierre:</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Día {card.closing_day}</span>
                    </div>
                  )}
                  {card.due_day && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate-400">⏰</span>
                      <span className="text-slate-500 dark:text-slate-400">Venc.:</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">Día {card.due_day}</span>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

export default memo(CreditCardsWidget);
