import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { investmentsService } from '@/lib/services/investments';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const daysRaw = req.nextUrl.searchParams.get('days');
    const days = Math.min(730, Math.max(7, Number(daysRaw) || 90));

    const points = await investmentsService.listPerformanceSnapshots(user.id, days);
    return NextResponse.json({ points });
  } catch (error: unknown) {
    console.error('investments performance GET error:', error);
    const message = error instanceof Error ? error.message : 'Error al cargar el historial';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
