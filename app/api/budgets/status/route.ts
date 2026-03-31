import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { budgetsService } from '@/lib/services/budgets';

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

    const status = await budgetsService.getStatus(user.id, month);
    return NextResponse.json(status);
  } catch (error) {
    console.error('Budget status error:', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}
