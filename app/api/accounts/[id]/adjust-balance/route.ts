import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transactionsService } from '@/lib/services/transactions';

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
    const target = body.targetBalance ?? body.target_balance;
    if (target === undefined || target === null) {
      return NextResponse.json({ error: 'Falta targetBalance' }, { status: 400 });
    }

    await transactionsService.createBalanceAdjustment(user.id, params.id, Number(target));

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al ajustar saldo';
    console.error('adjust-balance error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
