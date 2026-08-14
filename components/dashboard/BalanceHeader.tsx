'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { CreditCard, Eye, EyeOff, TrendingUp, Wallet } from 'lucide-react';
import AnimatedNumber from '@/components/ui/AnimatedNumber';
import ProgressBar from '@/components/ui/ProgressBar';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';

const LS_SHOW_INVESTMENT_PATRIMONY = 'zarix-dashboard-show-investment-patrimony';

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
  const shouldReduceMotion = useReducedMotion() ?? false;
  const hasCreditCards = totalCreditLimit > 0;
  const hasInvestments = investmentsUSD > 0 || investmentsARSBlue > 0;

  // Patrimonio con inversiones visible por defecto (app de patrimonio).
  // Respeta la preferencia guardada si el usuario lo ocultó explícitamente.
  const [showInvestmentPatrimony, setShowInvestmentPatrimony] = useState(true);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LS_SHOW_INVESTMENT_PATRIMONY);
      if (stored !== null) setShowInvestmentPatrimony(stored === 'true');
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
    <div className="space-y-4" data-tour="balance">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div 
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={maybeReduceTransition(shouldReduceMotion, motionTransition.smooth)}
          className="card bg-primary/10 border-primary/25"
        >
          <div className="flex items-center gap-2 mb-3">
            <motion.span
              className="inline-flex text-primary"
              animate={shouldReduceMotion ? undefined : { scale: [1, 1.08, 1] }}
              transition={shouldReduceMotion ? undefined : { duration: 2.3, repeat: Infinity, repeatDelay: 3.5 }}
            >
              <Wallet className="w-6 h-6" aria-hidden />
            </motion.span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Patrimonio Líquido
              </h2>
              <p className="text-xs text-muted-foreground">
                Para gastar hoy
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-primary">
                <AnimatedNumber value={liquidARSBlue} prefix="$" decimals={0} />
              </span>
              <span className="text-sm font-medium text-muted-foreground">ARS</span>
            </div>
            <div className="flex items-baseline gap-2 text-muted-foreground">
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
              transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.05 })}
            className="card bg-accent-invest/5 dark:bg-accent-invest/10 border-accent-invest/25 relative"
            >
              <button
                type="button"
                onClick={toggleInvestmentPatrimony}
                className="absolute top-3 right-3 p-2 rounded-xl text-muted-foreground hover:text-accent-invest hover:bg-accent-invest/10 dark:hover:bg-accent-invest/20 transition-colors"
                title="Ocultar patrimonio de inversiones"
                aria-label="Ocultar patrimonio de inversiones"
              >
                <Eye className="w-5 h-5" aria-hidden />
              </button>
              <div className="flex items-center gap-2 mb-3 pr-10">
                <motion.span
                  className="inline-flex text-accent-invest"
                  animate={shouldReduceMotion ? undefined : { y: [0, -3, 0] }}
                  transition={shouldReduceMotion ? undefined : { duration: 1.8, repeat: Infinity, repeatDelay: 2.4 }}
                >
                  <TrendingUp className="w-6 h-6" aria-hidden />
                </motion.span>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">
                    Patrimonio Total
                  </h2>
                  <p className="text-xs text-muted-foreground">Con inversiones</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-accent-invest">
                    <AnimatedNumber value={totalARSBlue} prefix="$" decimals={0} />
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">ARS</span>
                </div>
                <div className="flex items-baseline gap-2 text-muted-foreground">
                  <span className="text-lg font-semibold">
                    <AnimatedNumber value={totalUSD} prefix="USD " decimals={2} />
                  </span>
                </div>
                <div className="text-xs text-accent-invest mt-3 pt-3 border-t border-accent-invest/25 dark:border-accent-invest/30 flex items-center gap-1">
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
              transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.05 })}
              className="card border-2 border-dashed border-accent-invest/25 dark:border-accent-invest/30 bg-accent-invest/5 dark:bg-accent-invest/10 flex flex-col items-center justify-center gap-3 py-8 px-4 text-center min-h-[180px]"
            >
              <button
                type="button"
                onClick={toggleInvestmentPatrimony}
                className="p-3 rounded-2xl text-accent-invest bg-accent-invest/10 dark:bg-accent-invest/20 hover:bg-accent-invest/20 dark:hover:bg-accent-invest/30 transition-colors"
                title="Mostrar patrimonio de inversiones"
                aria-label="Mostrar patrimonio de inversiones"
              >
                <EyeOff className="w-8 h-8" aria-hidden />
              </button>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Patrimonio de inversiones oculto
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tocá el ojo para ver totales con inversiones
                </p>
              </div>
            </motion.div>
          )
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.05 })}
            className="card border-2 border-dashed border-border bg-secondary/50"
          >
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-6 h-6 text-muted-foreground" aria-hidden />
              <h2 className="text-sm font-medium text-muted-foreground">
                Sin inversiones aún
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Creá una cuenta tipo &quot;Inversión&quot; para trackear tu patrimonio invertido
            </p>
          </motion.div>
        )}
      </div>

      {hasCreditCards && (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.12 })}
          className="card bg-warning/10 border-warning/25"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-warning" aria-hidden />
              <h2 className="text-sm font-semibold text-foreground">
                Tarjetas de Crédito
              </h2>
            </div>
            <span className={`text-xs font-bold px-3 py-1 rounded-full ${
              creditUtilization > 80
                ? 'bg-destructive/15 text-destructive'
                : creditUtilization > 50
                ? 'bg-warning/15 text-warning'
                : 'bg-success/15 text-success'
            }`}>
              {creditUtilization.toFixed(0)}% usado
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Usado</p>
              <p className="text-xl font-bold text-warning">
                <AnimatedNumber value={totalCreditUsed} prefix="$" decimals={0} />
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Límite</p>
              <p className="text-xl font-semibold text-muted-foreground">
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
