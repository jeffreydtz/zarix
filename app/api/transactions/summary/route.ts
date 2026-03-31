import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transactionsService } from '@/lib/services/transactions';

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

    const { searchParams } = new URL(req.url);
    const monthParam = searchParams.get('month');
    const month = monthParam ? new Date(monthParam) : new Date();

    const summary = await transactionsService.getMonthSummary(user.id, month);

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Summary GET error:', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}
