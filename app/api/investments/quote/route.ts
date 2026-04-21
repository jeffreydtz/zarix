import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import type { InvestmentType } from '@/types/database';

export const dynamic = 'force-dynamic';

const QUOTE_TYPES: InvestmentType[] = [
  'stock_arg',
  'cedear',
  'stock_us',
  'etf',
  'crypto',
];

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

    if (!symbol || !type || !QUOTE_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Símbolo o tipo inválido' }, { status: 400 });
    }

    if (type === 'crypto') {
      const q = await cotizacionesService.getCryptoQuote(symbol);
      return NextResponse.json({
        ok: true,
        symbol: q.symbol,
        price: q.priceUSD,
        currency: 'USD',
        changePct: q.change24h,
      });
    }

    const market: 'us' | 'arg' | 'cedear' =
      type === 'stock_arg' ? 'arg' : type === 'cedear' ? 'cedear' : 'us';

    const q = await cotizacionesService.getStockQuote(symbol, market);
    return NextResponse.json({
      ok: true,
      symbol: q.ticker,
      price: q.price,
      currency: q.currency,
      changePct: q.change,
    });
  } catch (error: unknown) {
    console.error('investments quote error:', error);
    const message = error instanceof Error ? error.message : 'No se pudo obtener la cotización';
    return NextResponse.json({ ok: false, error: message }, { status: 200 });
  }
}
