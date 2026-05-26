'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, TrendingUp } from 'lucide-react';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';

interface PortfolioSummaryProps {
  totalValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  blueArsPerUsd: number;
  totalValueArsBlue: number;
  totalPnLArsBlue: number;
  totalDailyPnLUsd: number;
  totalDailyPnLPercent: number;
  totalDailyPnLArsBlue: number;
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

function formatUsd(value: number, fractionDigits = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

function formatArs(value: number): string {
  return value.toLocaleString('es-AR', { maximumFractionDigits: 0 });
}

function formatPct(value: number, fractionDigits = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(fractionDigits)}%`;
}

function pnlClass(value: number): string {
  if (value > 0) return 'text-emerald-500 dark:text-emerald-400';
  if (value < 0) return 'text-red-500 dark:text-red-400';
  return 'text-muted-foreground';
}

export default function PortfolioSummary({
  totalValue,
  totalPnL,
  totalPnLPercent,
  blueArsPerUsd,
  totalValueArsBlue,
  totalPnLArsBlue,
  totalDailyPnLUsd,
  totalDailyPnLPercent,
  totalDailyPnLArsBlue,
  byType,
}: PortfolioSummaryProps) {
  const shouldReduceMotion = useReducedMotion() ?? false;
  const dayPositive = totalDailyPnLUsd >= 0;
  const totalPositive = totalPnL >= 0;

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={maybeReduceTransition(shouldReduceMotion, motionTransition.smooth)}
        className="card card-spotlight"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
              Portafolio
            </div>
            <h2 className="text-base font-semibold text-foreground mt-1">Valor total</h2>
          </div>
          <span className="badge badge-primary">
            blue ~${blueArsPerUsd > 0 ? formatArs(blueArsPerUsd) : '—'} / USD
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 sm:gap-6 items-end">
          <div>
            <div className="text-3xl sm:text-4xl font-bold text-foreground tabular-nums leading-tight">
              USD {formatUsd(totalValue)}
            </div>
            <div className="text-sm text-muted-foreground tabular-nums mt-1">
              ≈ ARS {formatArs(totalValueArsBlue)} <span className="opacity-70">(blue)</span>
            </div>
          </div>

          <div className="flex flex-col gap-1 sm:items-end">
            <div className={`flex items-center gap-1.5 text-sm font-semibold tabular-nums ${pnlClass(totalDailyPnLUsd)}`}>
              {dayPositive ? (
                <ArrowUpRight size={16} aria-hidden />
              ) : (
                <ArrowDownRight size={16} aria-hidden />
              )}
              <span>
                {dayPositive ? '+' : ''}USD {formatUsd(totalDailyPnLUsd)}
              </span>
              <span className="text-xs font-medium opacity-80">
                ({formatPct(totalDailyPnLPercent)})
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground uppercase tracking-wide">P&L del día</div>
            <div className="text-[11px] text-muted-foreground tabular-nums">
              ARS {dayPositive ? '+' : ''}
              {formatArs(totalDailyPnLArsBlue)}
            </div>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border/70 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp size={14} aria-hidden className="opacity-70" />
            <span>P&L total desde la compra</span>
          </div>
          <div className={`text-sm font-semibold tabular-nums ${pnlClass(totalPnL)}`}>
            {totalPositive ? '+' : ''}USD {formatUsd(totalPnL)}
            <span className="ml-1 text-xs opacity-80">({formatPct(totalPnLPercent)})</span>
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              · ARS {totalPositive ? '+' : ''}
              {formatArs(totalPnLArsBlue)}
            </span>
          </div>
        </div>
      </motion.div>

      {byType.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.06 })}
          className="card"
        >
          <h3 className="text-base font-semibold text-foreground mb-4">Distribución por tipo</h3>
          <div className="space-y-4">
            {byType.map((item) => {
              const percent = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
              const pnlSign = item.pnl >= 0 ? '+' : '';
              return (
                <div key={item.type}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-foreground">
                      {TYPE_LABELS[item.type] || item.type}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {percent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-surface-soft rounded-full h-2 overflow-hidden">
                    <motion.div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min(100, percent)}%`, transformOrigin: '0% 50%' }}
                      initial={{ scaleX: shouldReduceMotion ? Math.min(100, percent) / 100 : 0 }}
                      animate={{ scaleX: Math.min(100, percent) / 100 }}
                      transition={maybeReduceTransition(shouldReduceMotion, {
                        ...motionTransition.smooth,
                        delay: 0.08,
                        duration: 0.35,
                      })}
                    />
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs text-muted-foreground">
                      {item.count} {item.count === 1 ? 'posición' : 'posiciones'}
                    </span>
                    <div className="flex items-center gap-2 text-xs tabular-nums">
                      <span className="text-muted-foreground">
                        USD {item.value.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </span>
                      <span className={pnlClass(item.pnl)}>
                        {pnlSign}
                        {item.pnl.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
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
