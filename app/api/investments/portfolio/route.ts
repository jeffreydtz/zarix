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

    const live = req.nextUrl.searchParams.get('live') === '1';
    const portfolio = await investmentsService.getPortfolioSummary(user.id, {
      forceRefreshQuotes: live,
      skipQuoteRefresh: !live,
      skipDailySnapshot: true,
    });
    return NextResponse.json(portfolio);
  } catch (error: unknown) {
    console.error('Portfolio GET error:', error);
    const message = error instanceof Error ? error.message : 'Error al calcular el portfolio';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
