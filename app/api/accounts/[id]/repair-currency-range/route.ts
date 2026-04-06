import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { transactionsService } from '@/lib/services/transactions';

function isYmd(s: unknown): s is string {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

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
    const startDate = body.startDate ?? body.start_date;
    const endDate = body.endDate ?? body.end_date;

    if (!isYmd(startDate) || !isYmd(endDate)) {
      return NextResponse.json(
        { error: 'Enviá startDate y endDate como YYYY-MM-DD' },
        { status: 400 }
      );
    }

    if (startDate > endDate) {
      return NextResponse.json(
        { error: 'La fecha desde tiene que ser anterior o igual a la fecha hasta' },
        { status: 400 }
      );
    }

    const force = Boolean(body.force);
    const onlyUsd = Boolean(body.onlyUsd ?? body.only_usd);

    const result = await transactionsService.repairCrossCurrencyInDateRange(
      user.id,
      params.id,
      startDate,
      endDate,
      { force, onlyUsd }
    );

    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error al recalcular conversiones';
    console.error('repair-currency-range error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
