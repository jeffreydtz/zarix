import { NextRequest, NextResponse } from 'next/server';
import { isTransactionCurrency } from '@/lib/constants/transaction-currencies';
import { transactionsService } from '@/lib/services/transactions';
import { errorResponse, requireUser } from '@/lib/api-handler';
import { positiveMoneyAmount, rawJsonHasInvalidMoney } from '@/lib/money-amount';

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { user } = await requireUser();

    const transaction = await transactionsService.getById(params.id, user.id);
    return NextResponse.json(transaction);
  } catch (error: any) {
    console.error('Transaction GET error:', error);
    return errorResponse(error);
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { user } = await requireUser();

    const raw = await req.text();
    if (rawJsonHasInvalidMoney(raw)) {
      return NextResponse.json(
        { error: 'El monto en ARS, USD o EUR admite hasta dos decimales.' },
        { status: 400 }
      );
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'JSON inválido.' }, { status: 400 });
    }

    if (!body.account_id) {
      return NextResponse.json(
        { error: 'La cuenta es obligatoria para editar movimientos desde la app' },
        { status: 400 }
      );
    }

    const cur = String(body.currency ?? '').trim().toUpperCase();
    if (!isTransactionCurrency(cur)) {
      return NextResponse.json(
        { error: 'Solo se permiten monedas ARS, USD o EUR en movimientos' },
        { status: 400 }
      );
    }

    const amount = positiveMoneyAmount(body.amount);
    if (amount == null) {
      return NextResponse.json(
        { error: 'El monto debe ser un número mayor a 0' },
        { status: 400 }
      );
    }

    const data = await transactionsService.update(params.id, user.id, {
      accountId: String(body.account_id),
      amount,
      currency: cur,
      categoryId: (body.category_id as string | null | undefined) || null,
      description: (body.description as string | null | undefined) || null,
      notes: (body.notes as string | null | undefined) || null,
      transactionDate: body.transaction_date as string | undefined,
      destinationAccountId: (body.destination_account_id as string | null | undefined) ?? undefined,
      exchangeRateOverride: body.exchange_rate_override == null
        ? undefined
        : Number(body.exchange_rate_override),
      type: body.type == null ? undefined : String(body.type),
    });

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Transaction PATCH error:', error);
    return errorResponse(error);
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    // Preserve the verified session actor in the database deletion audit.
    const { user, supabase } = await requireUser();
    await transactionsService.delete(params.id, user.id, supabase);
    // 204 No Content must not include a body — use NextResponse directly
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    // Database details can contain the private deleted-row audit snapshot.
    console.error('Transaction DELETE error');
    return errorResponse(error);
  }
}
