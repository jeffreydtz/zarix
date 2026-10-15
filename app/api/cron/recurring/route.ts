import { NextRequest } from 'next/server';
import { RecurringRulesJob } from '@/lib/cron/recurring-job';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  return new RecurringRulesJob().run(request);
}
