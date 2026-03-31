import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { investmentsService } from '@/lib/services/investments';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const investments = await investmentsService.list(user.id);
    return NextResponse.json(investments);
  } catch (error) {
    console.error('Investments GET error:', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();

    const investment = await investmentsService.create({
      userId: user.id,
      accountId: body.accountId,
      type: body.type,
      ticker: body.ticker,
      name: body.name,
      quantity: body.quantity,
      purchasePrice: body.purchasePrice,
      purchaseCurrency: body.purchaseCurrency,
      purchaseDate: body.purchaseDate,
      maturityDate: body.maturityDate,
      interestRate: body.interestRate,
      notes: body.notes,
    });

    return NextResponse.json(investment, { status: 201 });
  } catch (error) {
    console.error('Investments POST error:', error);
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    );
  }
}
