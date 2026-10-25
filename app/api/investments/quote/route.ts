import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requireUser } from '@/lib/api-handler';
import type { InvestmentType } from '@/types/database';
import { quoteCacheKeyForPosition, refreshQuotesForInvestments } from '@/lib/market-data/quote-refresh';
import { investmentNeedsTicker } from '@/lib/investments/type-meta';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireUser();

    const symbol = req.nextUrl.searchParams.get('symbol')?.trim() || '';
    const type = req.nextUrl.searchParams.get('type') as InvestmentType | null;
    const marketCurrency = req.nextUrl.searchParams.get('currency')?.trim().toUpperCase() || null;
    const currentPrice = req.nextUrl.searchParams.get('currentPrice')
      ?? req.nextUrl.searchParams.get('current_price');
    const purchasePrice = req.nextUrl.searchParams.get('purchasePrice')
      ?? req.nextUrl.searchParams.get('purchase_price');
    const purchaseCurrency = (
      req.nextUrl.searchParams.get('purchaseCurrency')
      ?? req.nextUrl.searchParams.get('purchase_currency')
    )?.trim().toUpperCase() || null;

    if (!symbol || !type || !investmentNeedsTicker(type)) {
      return NextResponse.json({ error: 'Símbolo o tipo inválido' }, { status: 400 });
    }

    // Unlabeled CAFCI + USD book stays ok:false unless the request carries a
    // purchase price+currency to use as the plausibility anchor (same rule as
    // cron/dashboard). The add-investment UI does not send those params.
    const position = {
      type,
      ticker: symbol,
      market_currency: marketCurrency,
      purchase_currency: purchaseCurrency || marketCurrency,
      purchase_price: purchasePrice,
      current_price: currentPrice,
    };
    // This endpoint only previews discovery quotes; persistence paths require an anchor.
    const quotes = await refreshQuotesForInvestments([position], {
      allowUnanchoredFciPreview: true,
      allowStaleFx: true,
    });
    const cacheKey = quoteCacheKeyForPosition(position);
    const hit = cacheKey ? quotes.get(cacheKey) : undefined;
    if (!hit || hit.price <= 0) {
      return NextResponse.json({ ok: false, error: 'No se pudo obtener la cotización' }, { status: 200 });
    }

    return NextResponse.json({
      ok: true,
      symbol: symbol.toUpperCase(),
      price: hit.price,
      currency: hit.currency,
      changePct: hit.changePct,
      fxStale: Boolean(hit.fxStale),
      fxAsOf: hit.fxAsOf ?? null,
      source: 'refresh',
    });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
