import { redirect } from 'next/navigation';
import dynamic from 'next/dynamic';
import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/auth/session';
import { investmentsService } from '@/lib/services/investments';
import { accountsService } from '@/lib/services/accounts';
import InvestmentsWorkspace from '@/components/investments/InvestmentsWorkspace';
import type { Account } from '@/types/database';
import { PageHero, PageScaffold } from '@/components/ui/PageScaffold';
import MotionSection from '@/components/ui/MotionSection';

const MarketDataWidget = dynamic(() => import('@/components/investments/MarketDataWidget'), { ssr: false });
const InvestmentAccountsList = dynamic(() => import('@/components/investments/InvestmentAccountsList'), { ssr: false });

const INVESTMENT_LABELS: Record<string, string> = {
  plazo_fijo: 'Plazo Fijo',
  caucion: 'Caución',
  bond: 'Bono',
};

export default async function InvestmentsPage() {
  try {
    const user = await getCachedUser();

    if (!user) {
      redirect('/login');
    }
    const supabase = await createClient();

    const now = new Date();
    const in30Days = new Date(now);
    in30Days.setDate(in30Days.getDate() + 30);

    const [portfolio, investmentAccounts, upcomingMaturities] = await Promise.all([
      investmentsService.getPortfolioSummary(user.id, {
        skipDailySnapshot: true,
        skipQuoteRefresh: true,
      }).catch(() => ({
        investments: [],
        totalCurrentValue: 0,
        totalPurchaseValue: 0,
        totalPnL: 0,
        totalPnLPercent: 0,
        blueArsPerUsd: 1,
        totalCurrentValueArsBlue: 0,
        totalPurchaseValueArsBlue: 0,
        totalPnLArsBlue: 0,
        byType: [],
      })),
      accountsService.listInvestmentAccounts(user.id).catch(() => []),
      (async () => {
        const { data } = await supabase
          .from('investments')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .not('maturity_date', 'is', null)
          .gte('maturity_date', now.toISOString().split('T')[0])
          .lte('maturity_date', in30Days.toISOString().split('T')[0])
          .order('maturity_date', { ascending: true });
        return data || [];
      })().catch(() => []),
    ]);

    return (
      <PageScaffold
        hero={(
          <PageHero
            eyebrow="Portafolio"
            title="Inversiones"
            subtitle="Trackea posiciones, monitorea cotizaciones en vivo y controla vencimientos desde un workspace unificado."
          />
        )}
      >
        {investmentAccounts.length > 0 ? (
          <MotionSection delay={0.04} intensity="hero">
            <InvestmentAccountsList accounts={investmentAccounts as any} />
          </MotionSection>
        ) : null}

        <MotionSection delay={0.09} intensity="normal">
          <InvestmentsWorkspace
            initialPortfolio={portfolio}
            investmentAccounts={investmentAccounts as Account[]}
          />
        </MotionSection>

        <MotionSection delay={0.14} intensity="subtle">
          <MarketDataWidget />
        </MotionSection>

        {upcomingMaturities.length > 0 ? (
          <MotionSection delay={0.2} intensity="subtle" className="card border-amber-200 dark:border-amber-700/60 bg-gradient-to-br from-amber-50/90 via-white to-amber-100/65 dark:from-amber-900/20 dark:via-surface-elevated dark:to-amber-900/10">
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <span>Proximos vencimientos</span>
              <span className="ml-auto text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-semibold">
                {upcomingMaturities.length} en 30 dias
              </span>
            </h2>
            <div className="space-y-3">
              {upcomingMaturities.map((inv: any) => {
                const maturityDate = new Date(inv.maturity_date + 'T00:00:00');
                const daysLeft = Math.round((maturityDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                const totalValue = Number(inv.quantity) * Number(inv.purchase_price);
                let returnAmount = 0;
                if (inv.interest_rate) {
                  const daysDuration = inv.purchase_date
                    ? Math.round((maturityDate.getTime() - new Date(inv.purchase_date).getTime()) / (1000 * 60 * 60 * 24))
                    : 30;
                  returnAmount = totalValue * (Number(inv.interest_rate) / 100) * (daysDuration / 365);
                }

                const urgencyColor = daysLeft === 0
                  ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
                  : daysLeft <= 3
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700'
                  : 'bg-surface-soft border-border';

                return (
                  <div key={inv.id} className={`flex items-center gap-4 p-4 rounded-control border ${urgencyColor}`}>
                    <div className="w-12 h-12 rounded-control flex flex-col items-center justify-center bg-surface border border-border shrink-0">
                      <div className={`text-xl font-bold leading-none ${daysLeft === 0 ? 'text-red-500' : daysLeft <= 3 ? 'text-amber-500' : 'text-foreground'}`}>
                        {daysLeft}
                      </div>
                      <div className="text-xs text-muted-foreground">{daysLeft === 1 ? 'dia' : 'dias'}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-foreground truncate">
                        {inv.name}{inv.ticker ? ` (${inv.ticker})` : ''}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {INVESTMENT_LABELS[inv.type] || inv.type}
                        {inv.interest_rate && ` · TNA ${Number(inv.interest_rate).toFixed(2)}%`}
                        {' · '}{maturityDate.toLocaleDateString('es-AR')}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold text-foreground">
                        ${totalValue.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                      </div>
                      {returnAmount > 0 ? (
                        <div className="text-xs text-emerald-600 dark:text-emerald-400">
                          +${returnAmount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        </div>
                      ) : null}
                      <div className="text-xs text-muted-foreground">{inv.purchase_currency}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </MotionSection>
        ) : null}
      </PageScaffold>
    );
  } catch (error) {
    console.error('Investments page error:', error);
    redirect('/login');
  }
}

