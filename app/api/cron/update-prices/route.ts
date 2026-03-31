import { NextRequest, NextResponse } from 'next/server';
import { createServiceClientSync } from '@/lib/supabase/server';
import { cotizacionesService } from '@/lib/services/cotizaciones';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const CRYPTO_TICKER_MAP: Record<string, string> = {
  BTC: 'BTC',
  ETH: 'ETH',
  USDT: 'USDT',
  USDC: 'USDT',
  DAI: 'USDT',
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceClientSync();

  // Get all active investments with crypto or USD-priced assets
  const { data: investments, error } = await supabase
    .from('investments')
    .select('id, type, ticker, purchase_currency')
    .eq('is_active', true)
    .in('type', ['crypto', 'stock_us', 'etf', 'cedear']);

  if (error) {
    console.error('Error fetching investments for price update:', error);
    return NextResponse.json({ error: 'DB error' }, { status: 500 });
  }

  if (!investments || investments.length === 0) {
    return NextResponse.json({ message: 'No investments to update', updated: 0 });
  }

  let updated = 0;
  let errors = 0;

  // Group crypto by ticker to avoid duplicate API calls
  const cryptoTickers = new Set<string>();
  const priceCache: Record<string, number> = {};

  for (const inv of investments) {
    if (inv.type === 'crypto' && inv.ticker) {
      const mappedTicker = CRYPTO_TICKER_MAP[inv.ticker.toUpperCase()] || inv.ticker.toUpperCase();
      cryptoTickers.add(mappedTicker);
    }
  }

  // Fetch crypto prices
  for (const ticker of cryptoTickers) {
    try {
      const quote = await cotizacionesService.getCryptoQuote(ticker);
      priceCache[ticker] = quote.priceUSD;
    } catch (e) {
      console.error(`Error fetching price for ${ticker}:`, e);
    }
  }

  // Fetch USD/ARS rate (useful for USDT plazo fijo)
  let usdRate = 0;
  try {
    const dolar = await cotizacionesService.getDolarQuotes();
    usdRate = dolar.blue.sell;
    priceCache['USD_ARS'] = usdRate;
  } catch (e) {
    console.error('Error fetching USD rate:', e);
  }

  // Update individual investments
  for (const inv of investments) {
    let newPrice: number | null = null;

    if (inv.type === 'crypto' && inv.ticker) {
      const mappedTicker = CRYPTO_TICKER_MAP[inv.ticker.toUpperCase()] || inv.ticker.toUpperCase();
      newPrice = priceCache[mappedTicker] || null;
    }

    if (newPrice !== null) {
      const { error: updateError } = await supabase
        .from('investments')
        .update({
          current_price: newPrice,
          current_price_updated_at: new Date().toISOString(),
        })
        .eq('id', inv.id);

      if (updateError) {
        console.error(`Error updating price for ${inv.id}:`, updateError);
        errors++;
      } else {
        updated++;
      }
    }
  }

  // Also store exchange rates for historical tracking
  try {
    if (usdRate > 0) {
      await supabase.from('exchange_rates').upsert({
        source: 'blue',
        from_currency: 'USD',
        to_currency: 'ARS',
        rate: usdRate,
        timestamp: new Date().toISOString(),
      }, { onConflict: 'source,from_currency,to_currency,timestamp' });
    }

    for (const [ticker, price] of Object.entries(priceCache)) {
      if (ticker === 'USD_ARS') continue;
      await supabase.from('exchange_rates').upsert({
        source: 'coingecko',
        from_currency: ticker,
        to_currency: 'USD',
        rate: price,
        timestamp: new Date().toISOString(),
      }, { onConflict: 'source,from_currency,to_currency,timestamp' });
    }
  } catch (e) {
    console.error('Error storing exchange rates:', e);
  }

  return NextResponse.json({
    success: true,
    total: investments.length,
    updated,
    errors,
  });
}
