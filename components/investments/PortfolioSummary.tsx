'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';

interface PortfolioSummaryProps {
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  blueArsPerUsd: number;
  totalValueArsBlue: number;
  totalPnLArsBlue: number;
  byType: Array<{
    type: string;
    count: number;
    value: number;
    pnl: number;
  }>;
}

const TYPE_LABELS: Record<string, string> = {
  stock_arg: 'Acciones ARG',
  cedear: 'CEDEARs',
  stock_us: 'Acciones USA',
  etf: 'ETFs',
  crypto: 'Crypto',
  plazo_fijo: 'Plazo Fijo',
  fci: 'FCI',
  bond: 'Bonos',
  caucion: 'Cauciones',
  real_estate: 'Inmuebles',
  other: 'Otros',
};

export default function PortfolioSummary({
  totalValue,
  totalPnL,
  totalPnLPercent,
  blueArsPerUsd,
  totalValueArsBlue,
  totalPnLArsBlue,
  byType,
}: PortfolioSummaryProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={maybeReduceTransition(shouldReduceMotion, motionTransition.smooth)}
        className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm card-spotlight"
      >
        <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
          Valor total del portafolio
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Totales en <strong>USD equivalente</strong>: el peso se convierte con dólar blue (venta{' '}
          {blueArsPerUsd > 0 ? `~$${blueArsPerUsd.toLocaleString('es-AR', { maximumFractionDigits: 0 })}` : '—'} ARS
          por USD) para unificar con acciones USA y crypto.
        </p>
        <div className="text-3xl font-bold text-slate-900 dark:text-slate-50 tabular-nums mb-1">
          USD {totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
        </div>
        <div className="text-sm text-slate-600 dark:text-slate-300 tabular-nums mb-3">
          ≈ ARS{' '}
          {totalValueArsBlue.toLocaleString('es-AR', { maximumFractionDigits: 0 })} (referencia blue)
        </div>
        <div
          className={`text-lg font-medium tabular-nums ${
            totalPnL >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
          }`}
        >
          {totalPnL >= 0 ? '+' : ''}
          USD {totalPnL.toLocaleString('en-US', { minimumFractionDigits: 2 })}{' '}
          <span className="text-slate-500 dark:text-slate-400 font-normal">
            ({totalPnLPercent.toFixed(2)}%)
          </span>
        </div>
        <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          PnL en ARS blue: {totalPnL >= 0 ? '+' : ''}
          {totalPnLArsBlue.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="story-chip">Base de lectura: USD equivalente</span>
          <span className={`story-chip ${totalPnL >= 0 ? 'text-emerald-600 dark:text-emerald-300' : 'text-red-500 dark:text-red-300'}`}>
            Estado: {totalPnL >= 0 ? 'tracción positiva' : 'drawdown activo'}
          </span>
        </div>
      </motion.div>

      {byType.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.06 })}
          className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm"
        >
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">
            Distribución por tipo
          </h3>
          <div className="space-y-4">
            {byType.map((item) => {
              const percent = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
              return (
                <div key={item.type}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {TYPE_LABELS[item.type] || item.type}
                    </span>
                    <span className="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
                      {percent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-700/80 rounded-full h-2.5 overflow-hidden">
                    <motion.div
                      className="bg-emerald-500 dark:bg-emerald-500 rounded-full transition-all min-w-0"
                      style={{ width: `${Math.min(100, percent)}%`, height: '100%', transformOrigin: '0% 50%' }}
                      initial={{ scaleX: shouldReduceMotion ? Math.min(100, percent) / 100 : 0 }}
                      animate={{ scaleX: Math.min(100, percent) / 100 }}
                      transition={maybeReduceTransition(shouldReduceMotion, {
                        ...motionTransition.smooth,
                        delay: 0.08,
                        duration: 0.35,
                      })}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {item.count} posición{item.count !== 1 ? 'es' : ''}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      USD {item.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
