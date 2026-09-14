import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClientSync } from '@/lib/supabase/server';
import { isTransactionCurrency } from '@/lib/constants/transaction-currencies';
import { transactionsService } from '@/lib/services/transactions';
import { errorResponse } from '@/lib/api-handler';

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
    const minAmountParam = searchParams.get('minAmount');
    const maxAmountParam = searchParams.get('maxAmount');

    const limitRaw = parseInt(searchParams.get('limit') || '100', 10);
    const offsetRaw = parseInt(searchParams.get('offset') || '0', 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 5000) : 100;
    const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

    const transactions = await transactionsService.list(user.id, {
      accountId: searchParams.get('accountId') || undefined,
      categoryId: searchParams.get('categoryId') || undefined,
      type: searchParams.get('type') || undefined,
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      search: searchParams.get('search') || undefined,
      minAmount: minAmountParam ? parseFloat(minAmountParam) : undefined,
      maxAmount: maxAmountParam ? parseFloat(maxAmountParam) : undefined,
      limit,
      offset,
    });

    return NextResponse.json(transactions);
  } catch (error: any) {
    console.error('Transactions GET error:', error);
    return errorResponse(error);
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

    const offlineOwner = req.headers.get('x-zarix-offline-owner');
    if (offlineOwner && offlineOwner !== user.id) {
      return NextResponse.json({ error: 'La sesión cambió. Volvé a tu cuenta para sincronizar.' }, { status: 409 });
    }
    const body = await req.json();

    if (body.clientRequestId != null && (
      typeof body.clientRequestId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.clientRequestId)
    )) {
      return NextResponse.json({ error: 'Identificador de solicitud inválido.' }, { status: 400 });
    }
    if (body.clientRequestId && Number(body.installments) > 1) {
      return NextResponse.json({ error: 'Las solicitudes offline no admiten compras en cuotas.' }, { status: 400 });
    }

    if (!body.accountId) {
      return NextResponse.json(
        { error: 'La cuenta es obligatoria para crear movimientos manuales' },
        { status: 400 }
      );
    }

    if (!['expense', 'income', 'transfer'].includes(body.type)) {
      return NextResponse.json(
        { error: 'Tipo de movimiento inválido (debe ser gasto, ingreso o transferencia)' },
        { status: 400 }
      );
    }

    if (body.type === 'transfer' && !body.destinationAccountId) {
      return NextResponse.json(
        { error: 'Las transferencias requieren una cuenta destino.' },
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
      return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });
    }

    const transaction = await transactionsService.create({
      userId: user.id,
      clientRequestId: body.clientRequestId,
      type: body.type,
      accountId: body.accountId,
      destinationAccountId: body.destinationAccountId,
      amount,
      currency: cur,
      categoryId: body.categoryId,
      description: body.description,
      notes: body.notes,
      tags: body.tags,
      transactionDate: body.transactionDate,
      installments: body.installments,
      exchangeRateOverride: (() => {
        const raw = body.exchangeRateOverride;
        if (raw == null || raw === '') return undefined;
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : undefined;
      })(),
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error: any) {
    console.error('Transactions POST error:', error);
    return errorResponse(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Acción destructiva: exige confirmación explícita en el body para
    // que no se dispare por accidente / request CSRF-shaped.
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== 'DELETE_ALL') {
      return NextResponse.json(
        { error: 'Confirmación requerida' },
        { status: 400 }
      );
    }

    const serviceClient = createServiceClientSync();

    const { count, error } = await serviceClient
      .from('transactions')
      .delete({ count: 'exact' })
      .eq('user_id', user.id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      deleted: count ?? 0,
    });
  } catch (error: any) {
    console.error('Transactions DELETE ALL error:', error);
    return errorResponse(error);
  }
}
