import { validTransactionRequestId } from '@/lib/transaction-idempotency';
import { NextRequest, NextResponse } from 'next/server';
import { sharedExpensesService, isValidShareToken } from '@/lib/services/sharedExpenses';
import { errorResponse } from '@/lib/api-handler';
import { isCivilYmd } from '@/lib/transaction-date';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Editar un gasto del grupo (público, validado por token).
export async function PUT(
  req: NextRequest,
  props: { params: Promise<{ token: string; expenseId: string }> }
) {
  const params = await props.params;
  try {
    if (!isValidShareToken(params.token) || !UUID_REGEX.test(params.expenseId)) {
      return NextResponse.json({ error: 'Link inválido' }, { status: 404 });
    }

    const requestId = req.headers.get('Idempotency-Key');
    if (!validTransactionRequestId(requestId)) {
      return NextResponse.json({ error: 'Falta un identificador de solicitud válido.' }, { status: 400 });
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

    const actorMemberId = typeof body.actorMemberId === 'string' ? body.actorMemberId : '';
    if (!actorMemberId) {
      return NextResponse.json({ error: 'Identificate en el grupo para editar' }, { status: 400 });
    }

    const paidByMemberId = typeof body.paidByMemberId === 'string' ? body.paidByMemberId : '';
    if (!paidByMemberId) {
      return NextResponse.json({ error: 'Indicá quién pagó' }, { status: 400 });
    }

    let expenseDate: string | undefined;
    if (body.expenseDate) {
      if (typeof body.expenseDate !== 'string' || !isCivilYmd(body.expenseDate)) {
        return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 });
      }
      expenseDate = body.expenseDate;
    }

    const splitMemberIds = Array.isArray(body.splitMemberIds)
      ? body.splitMemberIds.filter((id: any) => typeof id === 'string')
      : undefined;

    const expense = await sharedExpensesService.updateExpenseByToken(
      params.token,
      params.expenseId,
      { requestId, actorMemberId, paidByMemberId, description, amount, expenseDate, splitMemberIds }
    );
    if (!expense) {
      return NextResponse.json({ error: 'Gasto no encontrado' }, { status: 404 });
    }

    return NextResponse.json(expense, { headers: { 'Idempotency-Key': requestId } });
  } catch (error: any) {
    console.error('Shared expense PUT error:', error);
    return errorResponse(error);
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ token: string; expenseId: string }> }
) {
  const params = await props.params;
  try {
    if (!isValidShareToken(params.token) || !UUID_REGEX.test(params.expenseId)) {
      return NextResponse.json({ error: 'Link inválido' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const actorMemberId =
      typeof (body as { actorMemberId?: string }).actorMemberId === 'string'
        ? (body as { actorMemberId: string }).actorMemberId
        : '';
    if (!actorMemberId) {
      return NextResponse.json({ error: 'Identificate en el grupo para borrar' }, { status: 400 });
    }

    const deleted = await sharedExpensesService.deleteExpenseByToken(
      params.token,
      params.expenseId,
      actorMemberId
    );
    if (!deleted) {
      return NextResponse.json({ error: 'Grupo no encontrado' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Shared expense DELETE error:', error);
    return errorResponse(error);
  }
}
