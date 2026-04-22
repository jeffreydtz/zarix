import { NextRequest, NextResponse } from 'next/server';
import { createServiceClientSync } from '@/lib/supabase/server';
import { verifyCronBearer } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!verifyCronBearer(authHeader, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClientSync();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('users')
    .update({ status: 'PAST_DUE' })
    .eq('status', 'GRACE_PERIOD')
    .not('grace_period_end', 'is', null)
    .lt('grace_period_end', nowIso)
    .select('id');

  if (error) {
    console.error('subscription-grace cron error:', error);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    transitioned_to_past_due: data?.length ?? 0,
    evaluated_at: nowIso,
  });
}
