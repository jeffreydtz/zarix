import { NextRequest } from 'next/server';
import { IterativeCronJob, ServiceClient } from '@/lib/cron/cron-job';
import { recordNetWorthSnapshot } from '@/lib/services/net-worth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Snapshot diario del patrimonio total por usuario (tabla net_worth_snapshots),
 * corre después de update-prices para capturar precios frescos. Es el único
 * escritor programado: visitar el dashboard no repite consultas ni persiste
 * snapshots. El unique(user, día) permite reintentar la captura del día.
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
