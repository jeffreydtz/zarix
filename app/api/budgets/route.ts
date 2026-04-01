import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { budgetsService } from '@/lib/services/budgets';

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
    const month = searchParams.get('month') || undefined;

    const budgets = await budgetsService.list(user.id, month);
    return NextResponse.json(budgets);
  } catch (error: any) {
    console.error('Budgets GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al obtener los presupuestos' },
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

    const budget = await budgetsService.create({
      userId: user.id,
      categoryId: body.categoryId,
      month: body.month,
      amount: body.amount,
      currency: body.currency,
      rolloverEnabled: body.rolloverEnabled,
      alertAtPercent: body.alertAtPercent,
    });

    return NextResponse.json(budget, { status: 201 });
  } catch (error: any) {
    console.error('Budgets POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al crear el presupuesto' },
      { status: 500 }
    );
  }
}
