import { NextRequest } from 'next/server';
import { IterativeCronJob, ServiceClient } from '@/lib/cron/cron-job';
import { recordNetWorthSnapshot } from '@/lib/services/net-worth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Snapshot diario del patrimonio total por usuario (tabla net_worth_snapshots),
 * corre después de update-prices para capturar precios frescos. El dashboard
 * también upsertea el día en cada visita — el unique(user, día) hace que ambos
 * caminos sean idempotentes entre sí.
 */
class NetWorthSnapshotJob extends IterativeCronJob<{ id: string }> {
  readonly name = 'net-worth-snapshot';

  protected async fetchItems(supabase: ServiceClient): Promise<Array<{ id: string }>> {
    const { data, error } = await supabase.from('users').select('id');
    if (error) throw error;
    return data ?? [];
  }

  protected async processItem(_supabase: ServiceClient, user: { id: string }): Promise<boolean> {
    return recordNetWorthSnapshot(user.id);
  }

  protected emptyMessage(): string {
    return 'No users';
  }
}

export async function GET(request: NextRequest) {
  return new NetWorthSnapshotJob().run(request);
}
