import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isTransactionCurrency } from '@/lib/constants/transaction-currencies';
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

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });
    }

    const cur = String(body.currency ?? '').trim().toUpperCase();
    if (!isTransactionCurrency(cur)) {
      return NextResponse.json(
        { error: 'Solo se permiten monedas ARS, USD o EUR en presupuestos' },
        { status: 400 }
      );
    }

    // La columna month es DATE (primer día del mes): aceptar YYYY-MM o YYYY-MM-01.
    const monthMatch = /^(\d{4})-(0[1-9]|1[0-2])(?:-01)?$/.exec(String(body.month ?? ''));
    if (!monthMatch) {
      return NextResponse.json(
        { error: 'Mes inválido (formato esperado: YYYY-MM)' },
        { status: 400 }
      );
    }
    const month = `${monthMatch[1]}-${monthMatch[2]}-01`;

    // La categoría debe ser del usuario (o del sistema, visibles para todos).
    if (body.categoryId) {
      const { data: cat } = await supabase
        .from('categories')
        .select('id')
        .eq('id', body.categoryId)
        .or(`user_id.eq.${user.id},is_system.eq.true`)
        .maybeSingle();
      if (!cat) {
        return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 });
      }
    }

    const budget = await budgetsService.create({
      userId: user.id,
      categoryId: body.categoryId || null,
      month,
      amount,
      currency: cur,
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
