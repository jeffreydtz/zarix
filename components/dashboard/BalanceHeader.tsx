'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import AnimatedNumber from '@/components/ui/AnimatedNumber';
import ProgressBar from '@/components/ui/ProgressBar';

const LS_SHOW_INVESTMENT_PATRIMONY = 'zarix-dashboard-show-investment-patrimony';

function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  );
}

function EyeSlashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    </svg>
  );
}

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
  const hasInvestments = investmentsUSD > 0 || investmentsARSBlue > 0;

  const [showInvestmentPatrimony, setShowInvestmentPatrimony] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_SHOW_INVESTMENT_PATRIMONY);
      if (stored === 'true') setShowInvestmentPatrimony(true);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleInvestmentPatrimony = () => {
    setShowInvestmentPatrimony((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(LS_SHOW_INVESTMENT_PATRIMONY, next ? 'true' : 'false');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="card bg-gradient-to-br from-emerald-50 via-emerald-50 to-green-100 dark:from-emerald-500/10 dark:via-[#12151C] dark:to-[#1A1E27] border-emerald-200 dark:border-emerald-500/25"
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
              <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
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
          showInvestmentPatrimony ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            className="card bg-gradient-to-br from-violet-50 via-violet-50 to-fuchsia-100 dark:from-violet-500/10 dark:via-[#12151C] dark:to-[#1A1E27] border-violet-200 dark:border-violet-500/25 relative"
            >
              <button
                type="button"
                onClick={toggleInvestmentPatrimony}
                className="absolute top-3 right-3 p-2 rounded-xl text-slate-500 hover:text-purple-600 dark:text-slate-400 dark:hover:text-purple-300 hover:bg-purple-100/80 dark:hover:bg-purple-900/40 transition-colors"
                title="Ocultar patrimonio de inversiones"
                aria-label="Ocultar patrimonio de inversiones"
              >
                <EyeIcon className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2 mb-3 pr-10">
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
                  <p className="text-xs text-slate-500 dark:text-slate-400">Con inversiones</p>
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
              className="card border-2 border-dashed border-purple-200 dark:border-purple-800 bg-purple-50/40 dark:bg-purple-950/20 flex flex-col items-center justify-center gap-3 py-8 px-4 text-center min-h-[180px]"
            >
              <button
                type="button"
                onClick={toggleInvestmentPatrimony}
                className="p-3 rounded-2xl text-purple-600 dark:text-purple-300 bg-purple-100/80 dark:bg-purple-900/40 hover:bg-purple-200/90 dark:hover:bg-purple-900/60 transition-colors"
                title="Mostrar patrimonio de inversiones"
                aria-label="Mostrar patrimonio de inversiones"
              >
                <EyeSlashIcon className="w-8 h-8" />
              </button>
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Patrimonio de inversiones oculto
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Tocá el ojo para ver totales con inversiones
                </p>
              </div>
            </motion.div>
          )
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
          className="card bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-100 dark:from-amber-500/10 dark:via-[#12151C] dark:to-[#1A1E27] border-amber-200 dark:border-amber-500/25"
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
