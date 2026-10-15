import { NextRequest } from 'next/server';
import { CronJob, type ServiceClient } from '@/lib/cron/cron-job';
import { deliverNotificationOutbox } from '@/lib/services/notification-outbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

class NotificationOutboxJob extends CronJob {
  readonly name = 'notification-outbox';
  protected async execute(supabase: ServiceClient): Promise<Record<string, unknown>> {
    const result = await deliverNotificationOutbox(supabase);
    return { ...result, errors: result.failed };
  }
}

export async function GET(request: NextRequest) {
  return new NotificationOutboxJob().run(request);
}
