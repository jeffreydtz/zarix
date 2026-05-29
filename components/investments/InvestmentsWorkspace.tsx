'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader2, RefreshCw } from 'lucide-react';
import type { Account } from '@/types/database';
import type { InvestmentWithPnL, PortfolioSummaryPayload } from '@/lib/services/investments';
import PortfolioSummary from '@/components/investments/PortfolioSummary';
import InvestmentsList from '@/components/investments/InvestmentsList';
import AddInvestmentPanel from '@/components/investments/AddInvestmentPanel';
import EditInvestmentDialog from '@/components/investments/EditInvestmentDialog';
import SellPositionDialog from '@/components/investments/SellPositionDialog';
import PrivacyToggle from '@/components/investments/PrivacyToggle';
import ChartSkeleton from '@/components/ui/ChartSkeleton';
import { maybeReduceTransition, motionTransition } from '@/lib/motion';

// Recharts es pesado: se carga on-demand, no en el bundle inicial.
const PortfolioPerformanceChart = dynamic(
  () => import('@/components/investments/PortfolioPerformanceChart'),
  { ssr: false, loading: () => <ChartSkeleton height={288} /> }
);

interface InvestmentsWorkspaceProps {
  initialPortfolio: PortfolioSummaryPayload;
  investmentAccounts: Account[];
}

function formatRelative(date: Date | null): string {
  if (!date) return 'datos del servidor';
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 30) return 'hace unos segundos';
  if (diffSec < 90) return 'hace 1 min';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  return date.toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// El label se actualiza cada 30s. Aislado en su propio componente para que el
// tick no re-renderice todo el workspace (resumen, gráfico y lista de posiciones).
function LiveUpdatedLabel({ lastLiveAt }: { lastLiveAt: Date | null }) {
  const [label, setLabel] = useState(() => formatRelative(lastLiveAt));

  useEffect(() => {
    setLabel(formatRelative(lastLiveAt));
    if (!lastLiveAt) return;
    const interval = setInterval(() => setLabel(formatRelative(lastLiveAt)), 30000);
    return () => clearInterval(interval);
  }, [lastLiveAt]);

  return <span className="font-medium text-foreground">{label}</span>;
}

export default function InvestmentsWorkspace({
  initialPortfolio,
  investmentAccounts,
}: InvestmentsWorkspaceProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion() ?? false;
  const [portfolio, setPortfolio] = useState(initialPortfolio);
  const [lastLiveAt, setLastLiveAt] = useState<Date | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [editing, setEditing] = useState<InvestmentWithPnL | null>(null);
  const [selling, setSelling] = useState<InvestmentWithPnL | null>(null);

  useEffect(() => {
    setPortfolio(initialPortfolio);
  }, [initialPortfolio]);

  const refreshLive = useCallback(async () => {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const r = await fetch('/api/investments/portfolio?live=1', { cache: 'no-store' });
      if (!r.ok) {
        const detail = await r.json().catch(() => ({}));
        throw new Error(detail.error || 'No se pudo actualizar');
      }
      const data = (await r.json()) as PortfolioSummaryPayload;
      setPortfolio(data);
      setLastLiveAt(new Date());
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : 'No se pudo actualizar');
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 min-w-0">
            <AddInvestmentPanel investmentAccounts={investmentAccounts} onCreated={onPortfolioChanged} />
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-2 sm:text-right">
            <div className="flex items-center gap-2 justify-stretch sm:justify-end">
              <PrivacyToggle />
              <button
                type="button"
                onClick={() => void refreshLive()}
                disabled={liveLoading}
                className="btn btn-secondary inline-flex items-center justify-center gap-1.5 text-sm disabled:opacity-50"
              >
                {liveLoading ? (
                  <Loader2 size={14} aria-hidden className="animate-spin" />
                ) : (
                  <RefreshCw size={14} aria-hidden />
                )}
                {liveLoading ? 'Actualizando…' : 'Actualizar cotizaciones'}
              </button>
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              Última actualización: <LiveUpdatedLabel lastLiveAt={lastLiveAt} />
            </span>
            {liveError && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                {liveError} · usando último precio guardado
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
          totalDailyPnLUsd={portfolio.totalDailyPnLUsd}
          totalDailyPnLPercent={portfolio.totalDailyPnLPercent}
          totalDailyPnLArsBlue={portfolio.totalDailyPnLArsBlue}
          totalRealizedPnLUsd={portfolio.totalRealizedPnLUsd}
          totalRealizedPnLArsBlue={portfolio.totalRealizedPnLArsBlue}
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
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">Posiciones</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {portfolio.investments.length} {portfolio.investments.length === 1 ? 'activo' : 'activos'}
          </span>
        </div>
        <InvestmentsList
          investments={portfolio.investments}
          onArchived={onPortfolioChanged}
          onEdit={(inv) => setEditing(inv)}
          onSell={(inv) => setSelling(inv)}
        />
      </motion.section>

      <EditInvestmentDialog
        investment={editing}
        accounts={investmentAccounts}
        onClose={() => setEditing(null)}
        onSaved={onPortfolioChanged}
      />

      <SellPositionDialog
        investment={selling}
        onClose={() => setSelling(null)}
        onSold={onPortfolioChanged}
      />
    </div>
  );
}
