import { NextRequest } from 'next/server';
import { CronJob, ServiceClient } from '@/lib/cron/cron-job';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** UPDATE atómico único: no itera filas, extiende el template base directo. */
class SubscriptionGraceJob extends CronJob {
  readonly name = 'subscription-grace';

  protected async execute(supabase: ServiceClient): Promise<Record<string, unknown>> {
    const nowIso = new Date().toISOString();

    const { data, error } = await supabase
      .from('users')
      .update({ status: 'PAST_DUE' })
      .eq('status', 'GRACE_PERIOD')
      .not('grace_period_end', 'is', null)
      .lt('grace_period_end', nowIso)
      .select('id');

    if (error) throw error;

    return {
      transitioned_to_past_due: data?.length ?? 0,
      evaluated_at: nowIso,
    };
  }
}

export async function GET(request: NextRequest) {
  return new SubscriptionGraceJob().run(request);
}
