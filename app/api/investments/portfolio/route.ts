import { NextRequest, NextResponse } from 'next/server';
import { investmentsService } from '@/lib/services/investments';
import { errorResponse, requireUser } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser();

    const live = req.nextUrl.searchParams.get('live') === '1';
    const portfolio = await investmentsService.getPortfolioSummary(user.id, {
      forceRefreshQuotes: live,
      skipQuoteRefresh: !live,
      skipDailySnapshot: true,
    });
    return NextResponse.json(portfolio);
  } catch (error: unknown) {
    console.error('Portfolio GET error:', error);
    return errorResponse(error);
  }
}
