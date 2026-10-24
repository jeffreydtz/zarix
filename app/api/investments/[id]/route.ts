import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { PatchInvestmentInput } from '@/lib/services/investments';
import { investmentsService } from '@/lib/services/investments';
import { ApiError, errorResponse, requireUser } from '@/lib/api-handler';

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, user } = await requireUser();
    const { id } = await props.params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new ApiError('Identificador de posición inválido.', 400);
    }
    // The request's normal JWT/RLS client and an explicit owner predicate both
    // protect this read. Historical/archived own rows remain readable.
    const { data, error } = await supabase.from('investments')
      .select('*').eq('id', id).eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    if (!data) throw new ApiError('Posición no encontrada.', 404);
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
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
    if (body.purchaseDate !== undefined) {
      patch.purchaseDate =
        body.purchaseDate == null || String(body.purchaseDate).trim() === ''
          ? null
          : String(body.purchaseDate);
    }
    if ('paymentCurrency' in body) {
      patch.paymentCurrency =
        body.paymentCurrency == null || String(body.paymentCurrency).trim() === ''
          ? null
          : String(body.paymentCurrency).trim().toUpperCase();
    }
    if ('law' in body) {
      patch.law =
        body.law == null || String(body.law).trim() === ''
          ? null
          : String(body.law).trim();
    }
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
    if ('marketCurrency' in body) {
      patch.marketCurrency =
        body.marketCurrency == null || String(body.marketCurrency).trim() === ''
          ? null
          : String(body.marketCurrency).trim().toUpperCase();
    }
    if ('isManualPrice' in body) {
      patch.isManualPrice = body.isManualPrice === true;
    }
    if ('currentPrice' in body) {
      if (body.currentPrice === null || body.currentPrice === '') {
        patch.currentPrice = null;
      } else {
        const cp = Number(body.currentPrice);
        if (!Number.isFinite(cp) || cp <= 0) {
          return NextResponse.json({ error: 'Precio actual inválido' }, { status: 400 });
        }
        patch.currentPrice = cp;
      }
    }

    const investment = await investmentsService.update(params.id, user.id, patch);

    return NextResponse.json(investment);
  } catch (error: unknown) {
    console.error('investments PATCH error:', error);
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

    await investmentsService.delete(params.id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    console.error('investments DELETE error:', error);
    return errorResponse(error);
  }
}
