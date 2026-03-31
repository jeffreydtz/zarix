import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { investmentsService } from '@/lib/services/investments';
import PortfolioSummary from '@/components/investments/PortfolioSummary';
import InvestmentsList from '@/components/investments/InvestmentsList';

export default async function InvestmentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const portfolio = await investmentsService.getPortfolioSummary(user.id);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        <h1 className="text-3xl font-bold">Inversiones</h1>

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
}
