import { createServiceClientSync } from '@/lib/supabase/server';
import { cotizacionesService } from './cotizaciones';
import type { Investment } from '@/types/database';

export interface CreateInvestmentInput {
  userId: string;
  accountId: string;
  type: string;
  ticker?: string;
  name: string;
  quantity: number;
  purchasePrice: number;
  purchaseCurrency: string;
  purchaseDate: string;
  maturityDate?: string;
  interestRate?: number;
  notes?: string;
}

/** Actualización parcial (PATCH); `null` en ticker / fechas / tasa limpia en BD. */
export type PatchInvestmentInput = {
  accountId?: string;
  type?: string;
  ticker?: string | null;
  name?: string;
  quantity?: number;
  purchasePrice?: number;
  purchaseCurrency?: string;
  purchaseDate?: string;
  maturityDate?: string | null;
  interestRate?: number | null;
  notes?: string;
};

export interface InvestmentWithPnL extends Investment {
  current_value: number;
  profit_loss: number;
  profit_loss_percent: number;
  /** Moneda del precio de mercado actual (cotización). */
  market_price_currency: string;
  cost_basis_usd: number;
  market_value_usd: number;
  profit_loss_usd: number;
  profit_loss_percent_usd: number;
  market_value_ars_blue: number;
}

export interface PortfolioSummaryPayload {
  investments: InvestmentWithPnL[];
  /** Valor de mercado total en USD (ARS convertido con dólar blue venta). */
  totalCurrentValue: number;
  /** Capital invertido (costo) en USD, misma convención. */
  totalPurchaseValue: number;
  totalPnL: number;
  totalPnLPercent: number;
  /** Cotización blue usada (ARS por 1 USD). */
  blueArsPerUsd: number;
  /** Equivalentes en ARS (referencia blue). */
  totalCurrentValueArsBlue: number;
  totalPurchaseValueArsBlue: number;
  totalPnLArsBlue: number;
  byType: Array<{ type: string; count: number; value: number; pnl: number }>;
}

const STABLE_AS_USD = new Set(['USD', 'USDT', 'USDC', 'DAI', 'BUSD']);

function arsPerUsdFromDolar(blue: { sell: number; buy: number }): number {
  if (blue.sell > 0) return blue.sell;
  if (blue.buy > 0) return blue.buy;
  return 1;
}

function amountToUsd(amount: number, currency: string | null | undefined, arsPerUsd: number): number {
  const c = (currency || 'USD').toUpperCase();
  if (STABLE_AS_USD.has(c)) return amount;
  if (c === 'ARS') {
    const rate = arsPerUsd > 0 ? arsPerUsd : 1;
    return amount / rate;
  }
  return amount;
}

function usdToArsBlue(usd: number, arsPerUsd: number): number {
  const rate = arsPerUsd > 0 ? arsPerUsd : 1;
  return usd * rate;
}

function marketCurrencyForInvestment(inv: Investment): string {
  switch (inv.type) {
    case 'stock_arg':
    case 'cedear':
      return 'ARS';
    case 'stock_us':
    case 'etf':
    case 'crypto':
      return 'USD';
    default:
      return (inv.purchase_currency || 'USD').toUpperCase();
  }
}

function mapPatchToRow(updates: PatchInvestmentInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (updates.accountId !== undefined) row.account_id = updates.accountId;
  if (updates.type !== undefined) row.type = updates.type;
  if (updates.ticker !== undefined) row.ticker = updates.ticker;
  if (updates.name !== undefined) row.name = updates.name;
  if (updates.quantity !== undefined) row.quantity = updates.quantity;
  if (updates.purchasePrice !== undefined) row.purchase_price = updates.purchasePrice;
  if (updates.purchaseCurrency !== undefined) row.purchase_currency = updates.purchaseCurrency;
  if (updates.purchaseDate !== undefined) row.purchase_date = updates.purchaseDate;
  if (updates.maturityDate !== undefined) {
    row.maturity_date = updates.maturityDate;
  }
  if (updates.interestRate !== undefined) {
    row.interest_rate = updates.interestRate === null ? null : updates.interestRate;
  }
  if (updates.notes !== undefined) row.notes = updates.notes ?? null;
  return row;
}

class InvestmentsService {
  async create(input: CreateInvestmentInput): Promise<Investment> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('investments')
      .insert({
        user_id: input.userId,
        account_id: input.accountId,
        type: input.type as any,
        ticker: input.ticker || null,
        name: input.name,
        quantity: input.quantity,
        purchase_price: input.purchasePrice,
        purchase_currency: input.purchaseCurrency,
        purchase_date: input.purchaseDate,
        maturity_date: input.maturityDate || null,
        interest_rate: input.interestRate || null,
        notes: input.notes || null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  private async loadInvestmentsNormalized(
    userId: string,
    options?: { forceRefreshQuotes?: boolean }
  ): Promise<{ investments: InvestmentWithPnL[]; blueArsPerUsd: number }> {
    const supabase = createServiceClientSync();

    const dolar = await cotizacionesService.getDolarQuotes();
    const blueArsPerUsd = arsPerUsdFromDolar(dolar.blue);

    const { data: investments, error } = await supabase
      .from('investments')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const now = Date.now();
    const quoteCache = new Map<string, number>();
    const updates: Array<{ id: string; price: number }> = [];

    const investmentsWithPnL: InvestmentWithPnL[] = await Promise.all(
      (investments || []).map(async (inv) => {
        let currentPrice = Number(inv.current_price || inv.purchase_price);
        const lastUpdatedAt = inv.current_price_updated_at ? new Date(inv.current_price_updated_at).getTime() : 0;
        const isStale =
          Boolean(options?.forceRefreshQuotes) ||
          !lastUpdatedAt ||
          now - lastUpdatedAt > 15 * 60 * 1000;

        if (inv.ticker && isStale) {
          try {
            const cacheKey = `${inv.type}:${inv.ticker.toUpperCase()}`;
            if (quoteCache.has(cacheKey)) {
              currentPrice = quoteCache.get(cacheKey)!;
            } else if (inv.type === 'crypto') {
              const quote = await cotizacionesService.getCryptoQuote(inv.ticker);
              currentPrice = quote.priceUSD;
              quoteCache.set(cacheKey, currentPrice);
            } else if (inv.type === 'stock_us' || inv.type === 'etf') {
              const quote = await cotizacionesService.getStockQuote(inv.ticker, 'us');
              currentPrice = quote.price;
              quoteCache.set(cacheKey, currentPrice);
            } else if (inv.type === 'stock_arg') {
              const quote = await cotizacionesService.getStockQuote(inv.ticker, 'arg');
              currentPrice = quote.price;
              quoteCache.set(cacheKey, currentPrice);
            } else if (inv.type === 'cedear') {
              const quote = await cotizacionesService.getStockQuote(inv.ticker, 'cedear');
              currentPrice = quote.price;
              quoteCache.set(cacheKey, currentPrice);
            }

            updates.push({ id: inv.id, price: currentPrice });
          } catch (error) {
            console.error(`Error updating price for ${inv.ticker}:`, error);
          }
        }

        const qty = Number(inv.quantity);
        const purchaseUnit = Number(inv.purchase_price);
        const purchaseCur = (inv.purchase_currency || 'USD').toUpperCase();
        const marketCur = marketCurrencyForInvestment(inv);

        const costNative = qty * purchaseUnit;
        const marketNative = qty * currentPrice;

        const costUsd = amountToUsd(costNative, purchaseCur, blueArsPerUsd);
        const marketUsd = amountToUsd(marketNative, marketCur, blueArsPerUsd);
        const pnlUsd = marketUsd - costUsd;
        const pnlPctUsd = costUsd > 0 ? (pnlUsd / costUsd) * 100 : 0;

        return {
          ...inv,
          quantity: qty,
          purchase_price: purchaseUnit,
          current_price: currentPrice,
          interest_rate: inv.interest_rate ? Number(inv.interest_rate) : null,
          market_price_currency: marketCur,
          cost_basis_usd: costUsd,
          market_value_usd: marketUsd,
          profit_loss_usd: pnlUsd,
          profit_loss_percent_usd: pnlPctUsd,
          market_value_ars_blue: usdToArsBlue(marketUsd, blueArsPerUsd),
          current_value: marketUsd,
          profit_loss: pnlUsd,
          profit_loss_percent: pnlPctUsd,
        };
      })
    );

    if (updates.length > 0) {
      const nowIso = new Date().toISOString();
      await Promise.all(
        updates.map((u) =>
          supabase
            .from('investments')
            .update({
              current_price: u.price,
              current_price_updated_at: nowIso,
            })
            .eq('id', u.id)
        )
      );
    }

    return { investments: investmentsWithPnL, blueArsPerUsd };
  }

  async list(userId: string, options?: { forceRefreshQuotes?: boolean }): Promise<InvestmentWithPnL[]> {
    const { investments } = await this.loadInvestmentsNormalized(userId, options);
    return investments;
  }

  async getById(id: string, userId: string): Promise<Investment> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('investments')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data;
  }

  async update(id: string, userId: string, updates: PatchInvestmentInput): Promise<Investment> {
    const supabase = createServiceClientSync();
    const row = mapPatchToRow(updates);
    if (Object.keys(row).length === 0) {
      throw new Error('No hay campos para actualizar');
    }

    const { data, error } = await supabase
      .from('investments')
      .update(row)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async delete(id: string, userId: string): Promise<void> {
    const supabase = createServiceClientSync();

    const { error } = await supabase
      .from('investments')
      .update({ is_active: false })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  private async recordDailySnapshot(userId: string, summary: PortfolioSummaryPayload): Promise<void> {
    const supabase = createServiceClientSync();
    const snapshotDate = new Date().toISOString().split('T')[0];

    const { error } = await supabase.from('portfolio_performance_snapshots').upsert(
      {
        user_id: userId,
        snapshot_date: snapshotDate,
        cost_basis_usd: summary.totalPurchaseValue,
        market_value_usd: summary.totalCurrentValue,
        unrealized_pnl_usd: summary.totalPnL,
        roi_percent: summary.totalPnLPercent,
        blue_ars_per_usd: summary.blueArsPerUsd,
      },
      { onConflict: 'user_id,snapshot_date' }
    );

    if (error) {
      console.error('recordDailySnapshot:', error);
    }
  }

  async getPortfolioSummary(
    userId: string,
    options?: { forceRefreshQuotes?: boolean; skipDailySnapshot?: boolean }
  ): Promise<PortfolioSummaryPayload> {
    const { investments, blueArsPerUsd } = await this.loadInvestmentsNormalized(userId, options);

    const totalCurrentValue = investments.reduce((sum, inv) => sum + inv.market_value_usd, 0);
    const totalPurchaseValue = investments.reduce((sum, inv) => sum + inv.cost_basis_usd, 0);
    const totalPnL = totalCurrentValue - totalPurchaseValue;
    const totalPnLPercent = totalPurchaseValue > 0 ? (totalPnL / totalPurchaseValue) * 100 : 0;

    const totalCurrentValueArsBlue = usdToArsBlue(totalCurrentValue, blueArsPerUsd);
    const totalPurchaseValueArsBlue = usdToArsBlue(totalPurchaseValue, blueArsPerUsd);
    const totalPnLArsBlue = usdToArsBlue(totalPnL, blueArsPerUsd);

    const byType = investments.reduce((acc, inv) => {
      if (!acc[inv.type]) {
        acc[inv.type] = {
          type: inv.type,
          count: 0,
          value: 0,
          pnl: 0,
        };
      }

      acc[inv.type].count += 1;
      acc[inv.type].value += inv.market_value_usd;
      acc[inv.type].pnl += inv.profit_loss_usd;

      return acc;
    }, {} as Record<string, { type: string; count: number; value: number; pnl: number }>);

    const payload: PortfolioSummaryPayload = {
      totalCurrentValue,
      totalPurchaseValue,
      totalPnL,
      totalPnLPercent,
      blueArsPerUsd,
      totalCurrentValueArsBlue,
      totalPurchaseValueArsBlue,
      totalPnLArsBlue,
      byType: Object.values(byType),
      investments,
    };

    if (!options?.skipDailySnapshot) {
      await this.recordDailySnapshot(userId, payload);
    }

    return payload;
  }

  async listPerformanceSnapshots(userId: string, days: number): Promise<
    Array<{
      snapshot_date: string;
      cost_basis_usd: number;
      market_value_usd: number;
      unrealized_pnl_usd: number;
      roi_percent: number;
      blue_ars_per_usd: number;
    }>
  > {
    const supabase = createServiceClientSync();
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - Math.max(1, Math.min(days, 730)));

    const { data, error } = await supabase
      .from('portfolio_performance_snapshots')
      .select('snapshot_date, cost_basis_usd, market_value_usd, unrealized_pnl_usd, roi_percent, blue_ars_per_usd')
      .eq('user_id', userId)
      .gte('snapshot_date', since.toISOString().split('T')[0])
      .order('snapshot_date', { ascending: true });

    if (error) throw error;

    return (data || []).map((row) => ({
      snapshot_date: row.snapshot_date,
      cost_basis_usd: Number(row.cost_basis_usd),
      market_value_usd: Number(row.market_value_usd),
      unrealized_pnl_usd: Number(row.unrealized_pnl_usd),
      roi_percent: Number(row.roi_percent),
      blue_ars_per_usd: Number(row.blue_ars_per_usd),
    }));
  }
}

export const investmentsService = new InvestmentsService();
