'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { Account } from '@/types/database';
import type { InvestmentWithPnL, PortfolioSummaryPayload } from '@/lib/services/investments';
import PortfolioSummary from '@/components/investments/PortfolioSummary';
import InvestmentsList from '@/components/investments/InvestmentsList';
import AddInvestmentPanel from '@/components/investments/AddInvestmentPanel';
import PortfolioPerformanceChart from '@/components/investments/PortfolioPerformanceChart';
import EditInvestmentDialog from '@/components/investments/EditInvestmentDialog';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';

interface InvestmentsWorkspaceProps {
  initialPortfolio: PortfolioSummaryPayload;
  investmentAccounts: Account[];
}

export default function InvestmentsWorkspace({
  initialPortfolio,
  investmentAccounts,
}: InvestmentsWorkspaceProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [portfolio, setPortfolio] = useState(initialPortfolio);
  const [lastLiveAt, setLastLiveAt] = useState<Date | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [editing, setEditing] = useState<InvestmentWithPnL | null>(null);

  useEffect(() => {
    setPortfolio(initialPortfolio);
  }, [initialPortfolio]);

  const refreshLive = useCallback(async () => {
    setLiveLoading(true);
    try {
      const r = await fetch('/api/investments/portfolio?live=1', { cache: 'no-store' });
      if (!r.ok) return;
      const data = (await r.json()) as PortfolioSummaryPayload;
      setPortfolio(data);
      setLastLiveAt(new Date());
    } catch {
      /* ignore */
    } finally {
      setLiveLoading(false);
    }
  }, []);

  const onPortfolioChanged = useCallback(() => {
    void refreshLive();
    router.refresh();
  }, [refreshLive, router]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={maybeReduceTransition(shouldReduceMotion, motionTransition.smooth)}
        className="zx-panel p-4 md:p-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <AddInvestmentPanel investmentAccounts={investmentAccounts} onCreated={onPortfolioChanged} />
          <div className="flex flex-col items-stretch sm:items-end gap-2 text-xs text-muted-foreground sm:text-right tabular-nums">
            <button
              type="button"
              onClick={() => void refreshLive()}
              disabled={liveLoading}
              className="rounded-control border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground hover:bg-surface-soft disabled:opacity-50 transition-colors"
            >
              {liveLoading ? 'Actualizando...' : 'Actualizar cotizaciones'}
            </button>
            {lastLiveAt ? (
              <span>
                Ultima actualizacion en vivo:{' '}
                {lastLiveAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : (
              <span>
                Los datos iniciales vienen del servidor; toca el boton para forzar cotizaciones recientes.
              </span>
            )}
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.05 })}
      >
        <PortfolioSummary
          totalValue={portfolio.totalCurrentValue}
          totalPnL={portfolio.totalPnL}
          totalPnLPercent={portfolio.totalPnLPercent}
          blueArsPerUsd={portfolio.blueArsPerUsd}
          totalValueArsBlue={portfolio.totalCurrentValueArsBlue}
          totalPnLArsBlue={portfolio.totalPnLArsBlue}
          byType={portfolio.byType}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.09 })}
      >
        <PortfolioPerformanceChart days={90} refreshAt={lastLiveAt?.getTime() ?? 0} />
      </motion.div>

      <motion.section
        initial={{ opacity: 0, y: shouldReduceMotion ? 0 : 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={maybeReduceTransition(shouldReduceMotion, { ...motionTransition.smooth, delay: 0.14 })}
        className="space-y-3"
      >
        <h2 className="text-lg font-semibold text-foreground">Posiciones</h2>
        <InvestmentsList
          investments={portfolio.investments}
          onArchived={onPortfolioChanged}
          onEdit={(inv) => setEditing(inv)}
        />
      </motion.section>

      <EditInvestmentDialog
        investment={editing}
        accounts={investmentAccounts}
        onClose={() => setEditing(null)}
        onSaved={onPortfolioChanged}
      />
    </div>
  );
}
