import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { InvestmentType } from '@/types/database';
import { refreshQuotesForInvestments } from '@/lib/market-data/quote-refresh';
import { investmentNeedsTicker } from '@/lib/investments/type-meta';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const symbol = req.nextUrl.searchParams.get('symbol')?.trim() || '';
    const type = req.nextUrl.searchParams.get('type') as InvestmentType | null;
    const marketCurrency = req.nextUrl.searchParams.get('currency')?.trim().toUpperCase() || null;

    if (!symbol || !type || !investmentNeedsTicker(type)) {
      return NextResponse.json({ error: 'Símbolo o tipo inválido' }, { status: 400 });
    }

    const quotes = await refreshQuotesForInvestments([
      {
        type,
        ticker: symbol,
        market_currency: marketCurrency,
        purchase_currency: marketCurrency,
      },
    ]);
    const hit = quotes.get(`${type}:${symbol.trim().toUpperCase()}`);
    if (!hit || hit.price <= 0) {
      return NextResponse.json({ ok: false, error: 'No se pudo obtener la cotización' }, { status: 200 });
    }

    return NextResponse.json({
      ok: true,
      symbol: symbol.toUpperCase(),
      price: hit.price,
      currency: hit.currency,
      changePct: hit.changePct,
      source: 'refresh',
    });
  } catch (error: unknown) {
    console.error('investments quote error:', error);
    return NextResponse.json({ ok: false, error: 'No se pudo obtener la cotización' }, { status: 200 });
  }
}
