import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { investmentsService } from '@/lib/services/investments';

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

export async function POST(
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
      : new Date().toISOString().split('T')[0];
    const notes = typeof body.notes === 'string' && body.notes.trim()
      ? body.notes.trim()
      : undefined;

    const result = await investmentsService.sell({
      userId: user.id,
      investmentId: params.id,
      quantity,
      price,
      currency,
      soldAt,
      notes,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error: unknown) {
    console.error('investments sell error:', error);
    const message = error instanceof Error ? error.message : 'Error al registrar la venta';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

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

    const sales = await investmentsService.listSales(user.id, params.id);
    return NextResponse.json({ sales });
  } catch (error: unknown) {
    console.error('investments sales list error:', error);
    const message = error instanceof Error ? error.message : 'Error al cargar ventas';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
