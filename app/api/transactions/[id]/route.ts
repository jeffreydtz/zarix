import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClientSync } from '@/lib/supabase/server';
import { isTransactionCurrency } from '@/lib/constants/transaction-currencies';
import { transactionsService, computeTransferAmounts } from '@/lib/services/transactions';
import { ApiError, errorResponse, requireUser } from '@/lib/api-handler';
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
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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

    const serviceClient = createServiceClientSync();

    // Cargamos el movimiento existente (scoped por usuario) para validar el tipo.
    // Se conserva el tipo original. Las transferencias recalculan ambos importes.
    const { data: existing, error: existingErr } = await serviceClient
      .from('transactions')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (existingErr && existingErr.code !== 'PGRST116') throw existingErr;
    if (existingErr?.code === 'PGRST116' || !existing) {
      return NextResponse.json({ error: 'Movimiento no encontrado' }, { status: 404 });
    }

    if (existing.type === 'adjustment') {
      return NextResponse.json(
        { error: 'Los ajustes se registran mediante el formulario de saldo.' },
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
      .select('currency, is_active')
      .eq('id', body.account_id)
      .eq('user_id', user.id)
      .single();

    if (accErr && accErr.code !== 'PGRST116') throw accErr;
    if (accErr?.code === 'PGRST116' || !accRow || accRow.is_active === false) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 400 });
    }

    let amountPatch: Record<string, unknown> = {};
    const destinationId = body.destination_account_id ?? existing.destination_account_id;
    const financialChanged = amount !== Number(existing.amount) || cur !== existing.currency ||
      body.account_id !== existing.account_id ||
      (existing.type === 'transfer' && destinationId !== existing.destination_account_id) ||
      body.exchange_rate_override != null;
    if (!financialChanged) {
      // Corregir texto/categoría no aplica una cotización nueva al movimiento histórico.
      amountPatch = {
        amount_in_account_currency:existing.amount_in_account_currency,
        destination_amount_in_account_currency:existing.destination_amount_in_account_currency ?? null,
        exchange_rate:existing.exchange_rate,
      };
    }
    if (financialChanged && (existing.type === 'expense' || existing.type === 'income')) {
      const rec = await transactionsService.recomputeExpenseIncomeAmountFields(
        amount,
        cur,
        accRow.currency
      );
      amountPatch = {
        amount_in_account_currency: rec.amount_in_account_currency,
        exchange_rate: rec.exchange_rate,
      };
    } else if (financialChanged && existing.type === 'transfer') {
      if (!destinationId || destinationId === body.account_id) {
        return NextResponse.json({ error:'La cuenta destino debe ser distinta del origen.' },{ status:400 });
      }
      const { data: destination, error: destinationError } = await serviceClient
        .from('accounts').select('currency, is_active').eq('id',destinationId).eq('user_id',user.id).single();
      if (destinationError && destinationError.code !== 'PGRST116') throw destinationError;
      if (destinationError?.code === 'PGRST116' || !destination || destination.is_active === false) {
        return NextResponse.json({ error:'Cuenta destino no encontrada o archivada.' },{ status:400 });
      }
      const transfer = await computeTransferAmounts(amount,cur,accRow.currency,destination.currency,
        body.exchange_rate_override == null ? undefined : Number(body.exchange_rate_override));
      amountPatch = {
        destination_account_id:destinationId,
        amount_in_account_currency:transfer.amountInSource,
        destination_amount_in_account_currency:transfer.amountInDestination,
        exchange_rate:transfer.exchangeRate===1 ? null : transfer.exchangeRate,
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

    // Primary-key + owner filters can match at most one row.
    if (error?.code === 'PGRST116') throw new ApiError('Movimiento no encontrado', 404);
    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Transaction PATCH error:', error);
    return errorResponse(error);
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Preserve the verified session actor in the database deletion audit.
    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id);
    if (error) throw error;
    // 204 No Content must not include a body — use NextResponse directly
    return new NextResponse(null, { status: 204 });
  } catch (error: any) {
    // Database details can contain the private deleted-row audit snapshot.
    console.error('Transaction DELETE error');
    return errorResponse(error);
  }
}
