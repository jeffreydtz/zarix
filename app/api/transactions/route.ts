import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isTransactionCurrency } from '@/lib/constants/transaction-currencies';
import { transactionsService } from '@/lib/services/transactions';
import { validTransactionRequestId } from '@/lib/transaction-idempotency';
import { errorResponse, requireUser } from '@/lib/api-handler';
import { observedRequest } from '@/lib/observability/correlation';

export async function GET(req: NextRequest) {
  try {
    const { user } = await requireUser();

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
  return observedRequest(req, 'manual', 'transaction.create', async () => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const queueOwner = req.headers.get('X-Queue-Owner');
    if (queueOwner && queueOwner !== user.id) {
      return NextResponse.json({ error: 'La operación pertenece a otra sesión.' }, { status: 403 });
    }
    const requestId = req.headers.get('Idempotency-Key');
    if (!validTransactionRequestId(requestId)) {
      return NextResponse.json({ error: 'Falta un identificador de solicitud válido.' }, { status: 400 });
    }
    const body = await req.json();

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
      requestId,
      userId: user.id,
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

    return NextResponse.json(transaction, { status: 201, headers: { 'Idempotency-Key': requestId } });
  } catch (error: any) {
    return errorResponse(error);
  }
  });
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

    const { count, error } = await supabase
      .from('transactions')
      .delete({ count: 'exact' })
      .eq('user_id', user.id);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      deleted: count ?? 0,
    });
  } catch (error: any) {
    console.error('Transactions DELETE ALL error');
    return errorResponse(error);
  }
}
