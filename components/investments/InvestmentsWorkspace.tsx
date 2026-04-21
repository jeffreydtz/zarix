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

  useEffect(() => {
    const t = setTimeout(() => void refreshLive(), 600);
    return () => clearTimeout(t);
  }, [refreshLive]);

  useEffect(() => {
    const id = setInterval(() => void refreshLive(), 120_000);
    return () => clearInterval(id);
  }, [refreshLive]);

  const onPortfolioChanged = useCallback(() => {
    void refreshLive();
    router.refresh();
  }, [refreshLive, router]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <AddInvestmentPanel investmentAccounts={investmentAccounts} onCreated={onPortfolioChanged} />
        <div className="text-xs text-slate-500 dark:text-slate-400 sm:text-right tabular-nums">
          {liveLoading ? (
            <span>Actualizando cotizaciones…</span>
          ) : lastLiveAt ? (
            <span>
              Cotizaciones en vivo:{' '}
              {lastLiveAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
              <span className="block text-slate-400 dark:text-slate-500 mt-0.5">
                Próxima actualización automática en ~2 min
              </span>
            </span>
          ) : (
            <span>Sincronizando precios…</span>
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
