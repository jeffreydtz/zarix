import { NextRequest } from 'next/server';
import { IterativeCronJob, ServiceClient } from '@/lib/cron/cron-job';
import { FxUnavailableError, requireExecutableDolarQuote } from '@/lib/executable-fx';
import { cotizacionesService } from '@/lib/services/cotizaciones';
import {
  applyObservedRowMatch,
  applyObservedTimestampMatch,
  classifyAutomaticPriceZeroRows,
  monotonicCurrentPriceFilter,
  quoteCacheKeyForPosition,
  refreshQuotesForInvestments,
  shouldPersistFciQuote,
  type QuoteResult,
} from '@/lib/market-data/quote-refresh';
import type { InvestmentType } from '@/types/database';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface PriceRow {
  id: string;
  type: InvestmentType;
  ticker: string | null;
  market_currency: string | null;
  purchase_currency: string | null;
  purchase_price: number | string | null;
  current_price: number | string | null;
  current_price_updated_at: string | null;
  is_manual_price: boolean;
}

class UpdatePricesJob extends IterativeCronJob<PriceRow> {
  readonly name = 'update-prices';

  private quotes = new Map<string, QuoteResult>();
  private integrationErrors = 0;

  protected async execute(supabase: ServiceClient): Promise<Record<string, unknown>> {
    try {
      const dolar = await cotizacionesService.getDolarQuotes({ require: ['mep'], executable: true });
      requireExecutableDolarQuote(dolar.mep, 'MEP', 'mep');
    } catch (e) {
      if (!(e instanceof FxUnavailableError)) throw e;
      this.integrationErrors++;
      console.error('Error fetching USD rate:', e);
    }
    const result = await super.execute(supabase);
    return { ...result, errors: Number(result.errors ?? 0) + this.integrationErrors };
  }

  protected async fetchItems(supabase: ServiceClient): Promise<PriceRow[]> {
    const { data: investments, error } = await supabase
      .from('investments')
      .select('id, type, ticker, market_currency, purchase_currency, purchase_price, current_price, current_price_updated_at, is_manual_price')
      .eq('is_active', true)
      .eq('is_manual_price', false)
      .in('type', ['crypto', 'stock_us', 'etf', 'cedear', 'stock_arg', 'bond', 'on', 'fci']);

    if (error) throw error;
    return (investments || []) as PriceRow[];
  }

  protected async beforeAll(_supabase: ServiceClient, investments: PriceRow[]): Promise<void> {
    try {
      this.quotes = await refreshQuotesForInvestments(investments);
      for (const inv of investments) {
        const key = this.cacheKey(inv);
        if (!key) continue;
        const quote = this.quotes.get(key);
        if (!quote || !(quote.price > 0) || quote.fxStale) this.integrationErrors++;
      }
    } catch (e) {
      if (!(e instanceof FxUnavailableError)) throw e;
      this.integrationErrors++;
      console.error('Error refreshing investment quotes:', e);
      this.quotes = new Map();
    }
  }

  private cacheKey(inv: PriceRow): string | null {
    return quoteCacheKeyForPosition(inv);
  }

  protected shouldProcess(inv: PriceRow): boolean {
    const key = this.cacheKey(inv);
    if (!key) return false;
    const q = this.quotes.get(key);
    return Boolean(q && q.price > 0 && !q.fxStale);
  }

  protected async processItem(supabase: ServiceClient, inv: PriceRow): Promise<boolean | void> {
    const key = this.cacheKey(inv);
    if (!key) return false;
    const q = this.quotes.get(key);
    if (!q || q.price <= 0 || q.fxStale) return false;
    if (inv.type === 'fci' && !shouldPersistFciQuote(q)) {
      console.warn('[quotes] skip CAFCI failure', {
        ticker: inv.ticker,
        id: inv.id,
        reason: q.source === 'iol' ? 'undated' : 'invalid_date',
        source: q.source,
      });
      return false;
    }
    const sourceTs = q.timestamp;
    let query = applyObservedRowMatch(
      supabase
        .from('investments')
        .update({
          current_price: q.price,
          current_price_updated_at: q.timestamp,
          current_price_change_pct: q.changePct,
          market_currency: q.currency.trim().toUpperCase(),
        })
        .eq('id', inv.id),
      inv,
    );
    if (inv.type === 'fci' && sourceTs) {
      const { data, error } = await query.or(monotonicCurrentPriceFilter(sourceTs)).select('id');
      if (error) throw error;
      if (!Array.isArray(data) || data.length === 0) {
        const { data: winningRows, error: rereadError } = await supabase
          .from('investments')
          .select('id, type, ticker, market_currency, is_manual_price')
          .eq('id', inv.id);
        if (rereadError) throw rereadError;
        const winning = Array.isArray(winningRows)
          ? winningRows.find((row) => row.id === inv.id) ?? winningRows[0]
          : null;
        const reason = classifyAutomaticPriceZeroRows({
          observed: inv,
          winning,
        });
        console.warn('[quotes] skip CAFCI failure', {
          ticker: inv.ticker,
          id: inv.id,
          reason,
          source: q.source,
        });
        return false;
      }
      return true;
    }
    query = applyObservedTimestampMatch(query, inv.current_price_updated_at);
    const { data, error } = await query.select('id');
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) {
      console.warn('[quotes] skip price update', {
        reason: 'row_changed',
        ticker: inv.ticker,
        id: inv.id,
        type: inv.type,
      });
      return false;
    }
  }

  protected async afterAll(supabase: ServiceClient, _items: PriceRow[]): Promise<void> {
    try {
      for (const [key, quote] of this.quotes.entries()) {
        if (!key.startsWith('crypto:')) continue;
        if (!(quote.price > 0) || quote.fxStale) continue;
        const ticker = key.split(':')[1];
        if (!ticker) continue;
        const { error } = await supabase.from('exchange_rates').upsert({
          source: 'coingecko',
          from_currency: ticker,
          to_currency: 'USD',
          rate: quote.price,
          timestamp: quote.timestamp || new Date().toISOString(),
        }, { onConflict: 'source,from_currency,to_currency,timestamp' });
        if (error) throw error;
      }
    } catch (e) {
      this.integrationErrors++;
      console.error('Error storing exchange rates:', e);
    }
  }

  protected emptyMessage(): string {
    return 'No investments to update';
  }
}

export async function GET(request: NextRequest) {
  return new UpdatePricesJob().run(request);
}
