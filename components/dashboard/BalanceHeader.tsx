'use client';

import { motion } from 'framer-motion';
import AnimatedNumber from '@/components/ui/AnimatedNumber';
import ProgressBar from '@/components/ui/ProgressBar';

interface BalanceHeaderProps {
  liquidUSD: number;
  liquidARSBlue: number;
  investmentsUSD: number;
  investmentsARSBlue: number;
  totalUSD: number;
  totalARSBlue: number;
  totalCreditUsed?: number;
  totalCreditLimit?: number;
  creditUtilization?: number;
}

export default function BalanceHeader({ 
  liquidUSD,
  liquidARSBlue,
  investmentsUSD,
  investmentsARSBlue,
  totalUSD,
  totalARSBlue,
  totalCreditUsed = 0,
  totalCreditLimit = 0,
  creditUtilization = 0,
}: BalanceHeaderProps) {
  const hasCreditCards = totalCreditLimit > 0;
  const hasInvestments = investmentsUSD > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="card bg-gradient-to-br from-blue-50 via-blue-50 to-indigo-100 dark:from-blue-950 dark:via-slate-900 dark:to-indigo-950 border-blue-200 dark:border-blue-800"
        >
          <div className="flex items-center gap-2 mb-3">
            <motion.span 
              className="text-2xl"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            >
              💰
            </motion.span>
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Patrimonio Líquido
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Para gastar hoy
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                <AnimatedNumber value={liquidARSBlue} prefix="$" decimals={0} />
              </span>
              <span className="text-sm font-medium text-slate-500">ARS</span>
            </div>
            <div className="flex items-baseline gap-2 text-slate-600 dark:text-slate-400">
              <span className="text-lg font-semibold">
                <AnimatedNumber value={liquidUSD} prefix="USD " decimals={2} />
              </span>
            </div>
          </div>
        </motion.div>

        {hasInvestments ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="card bg-gradient-to-br from-purple-50 via-purple-50 to-pink-100 dark:from-purple-950 dark:via-slate-900 dark:to-pink-950 border-purple-200 dark:border-purple-800"
          >
            <div className="flex items-center gap-2 mb-3">
              <motion.span 
                className="text-2xl"
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
              >
                📈
              </motion.span>
              <div>
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Patrimonio Total
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Con inversiones
                </p>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                  <AnimatedNumber value={totalARSBlue} prefix="$" decimals={0} />
                </span>
                <span className="text-sm font-medium text-slate-500">ARS</span>
              </div>
              <div className="flex items-baseline gap-2 text-slate-600 dark:text-slate-400">
                <span className="text-lg font-semibold">
                  <AnimatedNumber value={totalUSD} prefix="USD " decimals={2} />
                </span>
              </div>
              <div className="text-xs text-purple-600 dark:text-purple-400 mt-3 pt-3 border-t border-purple-200 dark:border-purple-800 flex items-center gap-1">
                <span>Inversiones:</span>
                <span className="font-semibold">
                  <AnimatedNumber value={investmentsARSBlue} prefix="$" decimals={0} /> ARS
                </span>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="card border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/50"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl opacity-50">📈</span>
              <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Sin inversiones aún
              </h2>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Creá una cuenta tipo &quot;Inversión&quot; para trackear tu patrimonio invertido
            </p>
          </motion.div>
        )}
      </div>

      {hasCreditCards && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="card bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-100 dark:from-amber-950 dark:via-slate-900 dark:to-yellow-950 border-amber-200 dark:border-amber-800"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="text-2xl">💳</span>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Tarjetas de Crédito
              </h2>
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              creditUtilization > 80
                ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                : creditUtilization > 50
                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300'
                : 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
            }`}>
              {creditUtilization.toFixed(0)}% usado
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Usado</p>
              <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
                <AnimatedNumber value={totalCreditUsed} prefix="$" decimals={0} />
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Límite</p>
              <p className="text-xl font-semibold text-slate-700 dark:text-slate-300">
                <AnimatedNumber value={totalCreditLimit} prefix="$" decimals={0} />
              </p>
            </div>
          </div>
          
          <ProgressBar value={creditUtilization} max={100} height="h-2.5" />
        </motion.div>
      )}
    </div>
  );
}
