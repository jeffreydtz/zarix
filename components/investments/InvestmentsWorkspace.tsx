'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { Account } from '@/types/database';
import type { InvestmentWithPnL, PortfolioSummaryPayload } from '@/lib/services/investments';
import PortfolioSummary from '@/components/investments/PortfolioSummary';
import InvestmentsList from '@/components/investments/InvestmentsList';
import AddInvestmentPanel from '@/components/investments/AddInvestmentPanel';
import PortfolioPerformanceChart from '@/components/investments/PortfolioPerformanceChart';
import EditInvestmentDialog from '@/components/investments/EditInvestmentDialog';

interface InvestmentsWorkspaceProps {
  initialPortfolio: PortfolioSummaryPayload;
  investmentAccounts: Account[];
}

export default function InvestmentsWorkspace({
  initialPortfolio,
  investmentAccounts,
}: InvestmentsWorkspaceProps) {
  const router = useRouter();
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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <AddInvestmentPanel investmentAccounts={investmentAccounts} onCreated={onPortfolioChanged} />
        <div className="flex flex-col items-stretch sm:items-end gap-2 text-xs text-slate-500 dark:text-slate-400 sm:text-right tabular-nums">
          <button
            type="button"
            onClick={() => void refreshLive()}
            disabled={liveLoading}
            className="rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/80 disabled:opacity-50 transition-colors"
          >
            {liveLoading ? 'Actualizando…' : 'Actualizar cotizaciones'}
          </button>
          {lastLiveAt ? (
            <span>
              Última actualización en vivo:{' '}
              {lastLiveAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          ) : (
            <span className="text-slate-400 dark:text-slate-500">
              Los datos iniciales vienen del servidor; tocá el botón para forzar cotizaciones recientes.
            </span>
          )}
        </div>
      </div>

      <PortfolioSummary
        totalValue={portfolio.totalCurrentValue}
        totalPnL={portfolio.totalPnL}
        totalPnLPercent={portfolio.totalPnLPercent}
        blueArsPerUsd={portfolio.blueArsPerUsd}
        totalValueArsBlue={portfolio.totalCurrentValueArsBlue}
        totalPnLArsBlue={portfolio.totalPnLArsBlue}
        byType={portfolio.byType}
      />

      <PortfolioPerformanceChart days={90} refreshAt={lastLiveAt?.getTime() ?? 0} />

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Posiciones</h2>
        <InvestmentsList
          investments={portfolio.investments}
          onArchived={onPortfolioChanged}
          onEdit={(inv) => setEditing(inv)}
        />
      </section>

      <EditInvestmentDialog
        investment={editing}
        accounts={investmentAccounts}
        onClose={() => setEditing(null)}
        onSaved={onPortfolioChanged}
      />
    </div>
  );
}
