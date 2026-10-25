import { NextRequest } from 'next/server';
import { CronJob, type ServiceClient } from '@/lib/cron/cron-job';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

class RateLimitPurgeJob extends CronJob {
  readonly name = 'rate-limit-purge';

  protected async execute(supabase: ServiceClient): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.rpc('purge_rate_limit_counters', {
      p_older_than: '2 hours',
    });
    if (error) throw error;
    return { deleted: data ?? 0 };
  }
}

export async function GET(request: NextRequest) {
  return new RateLimitPurgeJob().run(request);
}
