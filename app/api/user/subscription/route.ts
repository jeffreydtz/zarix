import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { subscriptionsService } from '@/lib/services/subscriptions';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const state = await subscriptionsService.getUserState(user.id);
    if (!state) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      ...state,
      can_use_orchestrator: subscriptionsService.hasOrchestratorAccess(state.status),
    });
  } catch (error) {
    console.error('subscription GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
