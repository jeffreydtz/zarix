import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { investmentsService } from '@/lib/services/investments';
import { accountsService } from '@/lib/services/accounts';
import PortfolioSummary from '@/components/investments/PortfolioSummary';
import InvestmentsList from '@/components/investments/InvestmentsList';

export default async function InvestmentsPage() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect('/login');
    }

    const [portfolio, investmentAccounts] = await Promise.all([
      investmentsService.getPortfolioSummary(user.id).catch(() => ({
        investments: [],
        totalCurrentValue: 0,
        totalCost: 0,
        totalPnL: 0,
        totalPnLPercent: 0,
        byType: [],
      })),
      accountsService.list(user.id, { includeInvestments: true }).then(accs => 
        accs.filter(acc => acc.type === 'investment')
      ).catch(() => []),
    ]);

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto p-4 space-y-6">
          <h1 className="text-3xl font-bold">📈 Inversiones</h1>

          {investmentAccounts.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Cuentas de Inversión</h2>
              <div className="space-y-3">
                {investmentAccounts.map((account) => (
                  <div key={account.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{account.icon || '📈'}</span>
                      <div>
                        <div className="font-semibold">{account.name}</div>
                        <div className="text-sm text-gray-500">{account.currency}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold">
                        ${account.balance.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </div>
                      {account.balance_ars_blue && account.currency !== 'ARS' && (
                        <div className="text-xs text-gray-400">
                          ≈ ${account.balance_ars_blue.toLocaleString('es-AR')} ARS
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <PortfolioSummary
            totalValue={portfolio.totalCurrentValue}
            totalPnL={portfolio.totalPnL}
            totalPnLPercent={portfolio.totalPnLPercent}
            byType={portfolio.byType}
          />

          <InvestmentsList investments={portfolio.investments} />
        </div>
      </div>
    );
  } catch (error) {
    console.error('Investments page error:', error);
    redirect('/login');
  }
}
