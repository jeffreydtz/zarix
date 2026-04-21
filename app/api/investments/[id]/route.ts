import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { PatchInvestmentInput } from '@/lib/services/investments';
import { investmentsService } from '@/lib/services/investments';

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
    const patch: PatchInvestmentInput = {};

    if (body.accountId !== undefined) patch.accountId = body.accountId;
    if (body.type !== undefined) patch.type = body.type;
    if ('ticker' in body) {
      patch.ticker =
        body.ticker == null || String(body.ticker).trim() === ''
          ? null
          : String(body.ticker).trim().toUpperCase();
    }
    if (body.name !== undefined) patch.name = String(body.name);
    if (body.quantity !== undefined) {
      const q = Number(body.quantity);
      if (!Number.isFinite(q) || q <= 0) {
        return NextResponse.json({ error: 'Cantidad inválida' }, { status: 400 });
      }
      patch.quantity = q;
    }
    if (body.purchasePrice !== undefined) {
      const p = Number(body.purchasePrice);
      if (!Number.isFinite(p) || p <= 0) {
        return NextResponse.json({ error: 'Precio de compra inválido' }, { status: 400 });
      }
      patch.purchasePrice = p;
    }
    if (body.purchaseCurrency !== undefined) patch.purchaseCurrency = String(body.purchaseCurrency);
    if (body.purchaseDate !== undefined) patch.purchaseDate = String(body.purchaseDate);
    if ('maturityDate' in body) {
      patch.maturityDate =
        body.maturityDate === null || body.maturityDate === ''
          ? null
          : String(body.maturityDate);
    }
    if ('interestRate' in body) {
      if (body.interestRate === null || body.interestRate === '') {
        patch.interestRate = null;
      } else {
        const ir = Number(body.interestRate);
        patch.interestRate = Number.isFinite(ir) ? ir : null;
      }
    }
    if (body.notes !== undefined) patch.notes = body.notes;

    const investment = await investmentsService.update(params.id, user.id, patch);

    return NextResponse.json(investment);
  } catch (error: unknown) {
    console.error('investments PATCH error:', error);
    const message = error instanceof Error ? error.message : 'Error al actualizar';
    return NextResponse.json({ error: message }, { status: 500 });
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

    await investmentsService.delete(params.id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('investments DELETE error:', error);
    const message = error instanceof Error ? error.message : 'Error al archivar';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
