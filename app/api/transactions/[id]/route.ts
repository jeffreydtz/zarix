import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClientSync } from '@/lib/supabase/server';
import { isTransactionCurrency } from '@/lib/constants/transaction-currencies';
import { transactionsService } from '@/lib/services/transactions';

export async function GET(
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

    const transaction = await transactionsService.getById(params.id, user.id);
    return NextResponse.json(transaction);
  } catch (error: any) {
    console.error('Transaction GET error:', error);
    return NextResponse.json(
      { error: error.message || 'Movimiento no encontrado' },
      { status: 404 }
    );
  }
}

export async function PATCH(
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

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'El monto debe ser un número mayor a 0' },
        { status: 400 }
      );
    }

    const serviceClient = createServiceClientSync();

    // Cargamos el movimiento existente (scoped por usuario) para validar el tipo.
    // El trigger de saldos calcula el delta a partir de OLD.type; cambiar el tipo
    // o editar transfer/adjustment desde acá descuadra el balance silenciosamente.
    const { data: existing, error: existingErr } = await serviceClient
      .from('transactions')
      .select('type')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (existingErr || !existing) {
      return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 });
    }

    if (existing.type === 'transfer' || existing.type === 'adjustment') {
      return NextResponse.json(
        { error: 'Las transferencias y ajustes no se editan desde acá: borralos y recrealos.' },
        { status: 400 }
      );
    }

    if (body.type && body.type !== existing.type) {
      return NextResponse.json(
        { error: 'No se puede cambiar el tipo de un movimiento. Borralo y creá uno nuevo.' },
        { status: 400 }
      );
    }

    const { data: accRow, error: accErr } = await serviceClient
      .from('accounts')
      .select('currency')
      .eq('id', body.account_id)
      .eq('user_id', user.id)
      .single();

    if (accErr || !accRow) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 400 });
    }

    let amountPatch: Record<string, unknown> = {};
    if (existing.type === 'expense' || existing.type === 'income') {
      const rec = await transactionsService.recomputeExpenseIncomeAmountFields(
        amount,
        cur,
        accRow.currency
      );
      amountPatch = {
        amount_in_account_currency: rec.amount_in_account_currency,
        exchange_rate: rec.exchange_rate,
      };
    }

    const { data, error } = await serviceClient
      .from('transactions')
      .update({
        type: existing.type,
        amount,
        currency: cur,
        account_id: body.account_id,
        category_id: body.category_id || null,
        description: body.description || null,
        transaction_date: body.transaction_date,
        notes: body.notes || null,
        ...amountPatch,
      })
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Transaction PATCH error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al actualizar el movimiento' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    await transactionsService.delete(params.id, user.id);
    // 204 No Content must not include a body — use NextResponse directly
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    console.error('Transaction DELETE error:', error);
    return NextResponse.json(
      { error: error.message || 'Error al eliminar el movimiento' },
      { status: 500 }
    );
  }
}
