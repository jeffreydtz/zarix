import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClientSync } from '@/lib/supabase/server';
import { isTransactionCurrency } from '@/lib/constants/transaction-currencies';
import { transactionsService } from '@/lib/services/transactions';

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
    return NextResponse.json(
      { error: error.message || 'Error al obtener los movimientos' },
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

    if (!body.accountId) {
      return NextResponse.json(
        { error: 'La cuenta es obligatoria para crear movimientos manuales' },
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

    const transaction = await transactionsService.create({
      userId: user.id,
      type: body.type,
      accountId: body.accountId,
      destinationAccountId: body.destinationAccountId,
      amount: body.amount,
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
    return NextResponse.json(
      { error: error.message || 'Error al crear el movimiento' },
      { status: 500 }
    );
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
    return NextResponse.json(
      { error: error.message || 'Error al eliminar todos los movimientos' },
      { status: 500 }
    );
  }
}
