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
    });
    return NextResponse.json(portfolio);
  } catch (error: any) {
    console.error('Portfolio GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al calcular el portfolio' },
      { status: 500 }
    );
  }
}
