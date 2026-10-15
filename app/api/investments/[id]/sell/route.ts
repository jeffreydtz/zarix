import { validTransactionRequestId } from '@/lib/transaction-idempotency';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { investmentsService } from '@/lib/services/investments';
import { errorResponse } from '@/lib/api-handler';

export const dynamic = 'force-dynamic';

interface SellBody {
  quantity?: unknown;
  price?: unknown;
  currency?: unknown;
  soldAt?: unknown;
  notes?: unknown;
}

function parsePositive(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
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
    const body = (await req.json()) as SellBody;
    const quantity = parsePositive(body.quantity);
    const price = parsePositive(body.price);

    if (quantity === null) {
      return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
    }
    if (price === null) {
      return NextResponse.json({ error: 'Precio inválido' }, { status: 400 });
    }

    const currency = typeof body.currency === 'string' && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : 'USD';
    const soldAt = typeof body.soldAt === 'string' && body.soldAt
      ? body.soldAt
      : undefined;
    const notes = typeof body.notes === 'string' && body.notes.trim()
      ? body.notes.trim()
      : undefined;

    const result = await investmentsService.sell({
      requestId,
      userId: user.id,
      investmentId: params.id,
      quantity,
      price,
      currency,
      soldAt,
      notes,
    });

    return NextResponse.json(result, { status: 201, headers: { 'Idempotency-Key': requestId } });
  } catch (error: unknown) {
    console.error('investments sell error:');
    return errorResponse(error);
  }
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sales = await investmentsService.listSales(user.id, params.id);
    return NextResponse.json({ sales });
  } catch (error: unknown) {
    console.error('investments sales list error:');
    return errorResponse(error);
  }
}
