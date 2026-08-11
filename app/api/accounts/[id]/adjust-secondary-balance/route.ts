import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { accountsService } from '@/lib/services/accounts';
import { errorResponse } from '@/lib/api-handler';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const target = body.targetSecondaryBalance ?? body.target_secondary_balance;
    if (target === undefined || target === null) {
      return NextResponse.json({ error: 'Falta targetSecondaryBalance' }, { status: 400 });
    }

    await accountsService.createSecondaryBalanceAdjustment(user.id, params.id, Number(target));
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('adjust-secondary-balance error:', error);
    return errorResponse(error);
  }
}
