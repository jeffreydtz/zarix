import { NextRequest } from 'next/server';
import { IterativeCronJob, ServiceClient } from '@/lib/cron/cron-job';
import { investmentsService } from '@/lib/services/investments';
import { recordNetWorthSnapshot } from '@/lib/services/net-worth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Snapshot diario del patrimonio total y del portafolio por usuario
 * (net_worth_snapshots + portfolio_performance_snapshots). Corre después de
 * update-prices para capturar precios frescos. Las páginas nunca escriben el
 * snapshot de portafolio (skipDailySnapshot) para no alargar la carga; el
 * unique(user, día) hace que reintentos del cron sean idempotentes.
 */
class NetWorthSnapshotJob extends IterativeCronJob<{ id: string }> {
  readonly name = 'net-worth-snapshot';

  protected async fetchItems(supabase: ServiceClient): Promise<Array<{ id: string }>> {
    const { data, error } = await supabase.from('users').select('id');
    if (error) throw error;
    return data ?? [];
  }

  protected async processItem(_supabase: ServiceClient, user: { id: string }): Promise<boolean> {
    const netWorth = await recordNetWorthSnapshot(user.id);
    const portfolio = await investmentsService.recordDailySnapshotForUser(user.id);
    return netWorth || portfolio;
  }

  protected emptyMessage(): string {
    return 'No users';
  }
}

export async function GET(request: NextRequest) {
  return new NetWorthSnapshotJob().run(request);
}
