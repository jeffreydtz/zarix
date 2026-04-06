'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import type { AccountWithBalance } from '@/lib/services/accounts';
import AccountBalanceEquivalents from '@/components/accounts/AccountBalanceEquivalents';
import Link from 'next/link';

interface AccountCardsProps {
  accounts: AccountWithBalance[];
}

function AccountCards({ accounts }: AccountCardsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.5 }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
          Tus Cuentas
        </h3>
        <Link 
          href="/accounts" 
          className="text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 font-medium"
        >
          Ver todas
        </Link>
      </div>
      
      <div className="flex overflow-x-auto gap-4 pb-4 snap-x snap-mandatory hide-scrollbar -mx-4 px-4">
        {accounts.map((account, index) => {
          const isCreditCard = account.type === 'credit_card';
          const creditUsed = isCreditCard ? Math.abs(account.balance) : 0;
          const creditLimit = account.credit_limit || 0;
          const creditUtilization = creditLimit > 0 ? (creditUsed / creditLimit) * 100 : 0;

          return (
            <Link
              key={account.id}
              href={`/accounts/${account.id}`}
              className="flex-shrink-0 w-72 snap-start block no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 rounded-2xl"
              aria-label={`Ver movimientos de ${account.name}`}
            >
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08 + 0.5 }}
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="rounded-2xl p-5 text-white cursor-pointer shadow-lg h-full"
              style={{ 
                background: `linear-gradient(135deg, ${account.color}, ${account.color}dd)`,
                boxShadow: `0 8px 32px ${account.color}40`
              }}
            >
              <div className="flex items-center justify-between mb-4">
                <motion.span 
                  className="text-3xl"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                >
                  {account.icon || '💳'}
                </motion.span>
                <span className="text-xs font-semibold bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full">
                  {account.currency}
                </span>
              </div>

              <div className="mb-2">
                <div className="text-sm font-medium opacity-90 mb-1">{account.name}</div>
                <div className="text-3xl font-bold tracking-tight">
                  {account.is_debt
                    ? `-$${Math.abs(Number(account.balance)).toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                      })}`
                    : `$${Number(account.balance).toLocaleString('es-AR', {
                        minimumFractionDigits: 2,
                      })}`}
                </div>
              </div>

              {Number(account.balance) !== 0 && (
                <AccountBalanceEquivalents account={account} variant="dark" />
              )}

              {isCreditCard && creditLimit > 0 && (
                <div className="mt-4 pt-3 border-t border-white/20">
                  <div className="flex justify-between text-xs font-medium mb-1.5">
                    <span>Usado</span>
                    <span>{creditUtilization.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(creditUtilization, 100)}%` }}
                      transition={{ duration: 0.8, delay: 0.3 }}
                      className="bg-white h-2 rounded-full"
                    />
                  </div>
                  <div className="text-xs mt-2 opacity-75 font-medium">
                    Limite: ${creditLimit.toLocaleString('es-AR')}
                  </div>
                </div>
              )}
            </motion.div>
            </Link>
          );
        })}

        {accounts.length === 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="card w-72 flex-shrink-0 text-center py-12"
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-5xl mb-4"
            >
              🏦
            </motion.div>
            <p className="text-slate-500 dark:text-slate-400 mb-4">No tenes cuentas todavia</p>
            <Link href="/accounts" className="btn btn-primary">
              Crear cuenta
            </Link>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

export default memo(AccountCards);
