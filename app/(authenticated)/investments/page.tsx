import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { investmentsService } from '@/lib/services/investments';
import { accountsService } from '@/lib/services/accounts';
import PortfolioSummary from '@/components/investments/PortfolioSummary';
import InvestmentsList from '@/components/investments/InvestmentsList';
import MarketDataWidget from '@/components/investments/MarketDataWidget';
import InvestmentAccountsList from '@/components/investments/InvestmentAccountsList';

const INVESTMENT_LABELS: Record<string, string> = {
  plazo_fijo: 'Plazo Fijo',
  caucion: 'Caución',
  bond: 'Bono',
};

export default async function InvestmentsPage() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect('/login');
    }

    const now = new Date();
    const in30Days = new Date(now);
    in30Days.setDate(in30Days.getDate() + 30);

    const [portfolio, investmentAccounts, upcomingMaturities] = await Promise.all([
      investmentsService.getPortfolioSummary(user.id).catch(() => ({
        investments: [],
        totalCurrentValue: 0,
        totalCost: 0,
        totalPnL: 0,
        totalPnLPercent: 0,
        byType: [],
      })),
      accountsService
        .list(user.id)
        .then((accs) => accs.filter((acc) => acc.type === 'investment'))
        .catch(() => []),
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
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto p-4 space-y-6">
          <h1 className="text-3xl font-bold">📈 Inversiones</h1>

          {investmentAccounts.length > 0 && (
            <InvestmentAccountsList accounts={investmentAccounts as any} />
          )}

          <PortfolioSummary
            totalValue={portfolio.totalCurrentValue}
            totalPnL={portfolio.totalPnL}
            totalPnLPercent={portfolio.totalPnLPercent}
            byType={portfolio.byType}
          />

          {/* Live market data */}
          <MarketDataWidget />

          {upcomingMaturities.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-amber-200 dark:border-amber-700/50 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
                <span>📅</span> Próximos Vencimientos
                <span className="ml-auto text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-semibold">
                  {upcomingMaturities.length} en 30 días
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
                    : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600';

                  return (
                    <div key={inv.id} className={`flex items-center gap-4 p-4 rounded-xl border ${urgencyColor}`}>
                      <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 shrink-0">
                        <div className={`text-xl font-bold leading-none ${daysLeft === 0 ? 'text-red-500' : daysLeft <= 3 ? 'text-amber-500' : 'text-slate-700 dark:text-slate-300'}`}>
                          {daysLeft}
                        </div>
                        <div className="text-xs text-slate-400">{daysLeft === 1 ? 'día' : 'días'}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-800 dark:text-slate-100 truncate">
                          {inv.name}{inv.ticker ? ` (${inv.ticker})` : ''}
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          {INVESTMENT_LABELS[inv.type] || inv.type}
                          {inv.interest_rate && ` · TNA ${Number(inv.interest_rate).toFixed(2)}%`}
                          {' · '}{maturityDate.toLocaleDateString('es-AR')}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-slate-800 dark:text-slate-100">
                          ${totalValue.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                        </div>
                        {returnAmount > 0 && (
                          <div className="text-xs text-emerald-600 dark:text-emerald-400">
                            +${returnAmount.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                          </div>
                        )}
                        <div className="text-xs text-slate-400">{inv.purchase_currency}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <InvestmentsList investments={portfolio.investments} />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Investments page error:', error);
    redirect('/login');
  }
}

