import { NextRequest, NextResponse } from 'next/server';
import { sharedExpensesService, isValidShareToken } from '@/lib/services/sharedExpenses';

// Agregar un gasto al grupo (público, validado por token).
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    if (!isValidShareToken(params.token)) {
      return NextResponse.json({ error: 'Link inválido' }, { status: 404 });
    }

    const body = await req.json();

    const description =
      typeof body.description === 'string' ? body.description.trim().slice(0, 200) : '';
    if (!description) {
      return NextResponse.json({ error: 'La descripción es obligatoria' }, { status: 400 });
    }

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 });
    }

    const paidByMemberId = typeof body.paidByMemberId === 'string' ? body.paidByMemberId : '';
    if (!paidByMemberId) {
      return NextResponse.json({ error: 'Indicá quién pagó' }, { status: 400 });
    }

    let expenseDate: string | undefined;
    if (body.expenseDate) {
      if (typeof body.expenseDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.expenseDate)) {
        return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 });
      }
      expenseDate = body.expenseDate;
    }

    const splitMemberIds = Array.isArray(body.splitMemberIds)
      ? body.splitMemberIds.filter((id: any) => typeof id === 'string')
      : undefined;

    const expense = await sharedExpensesService.addExpenseByToken(params.token, {
      paidByMemberId,
      description,
      amount,
      expenseDate,
      splitMemberIds,
    });
    if (!expense) {
      return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 });
    }

    return NextResponse.json(expense, { status: 201 });
  } catch (error: any) {
    console.error('Shared expense POST error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al agregar el gasto' },
      { status: 500 }
    );
  }
}
