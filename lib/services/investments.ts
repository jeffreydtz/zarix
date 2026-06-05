import { createServiceClientSync } from '@/lib/supabase/server';
import { cotizacionesService } from './cotizaciones';
import { fetchYahooStockQuotesMap } from '@/lib/yahoo-finance-quotes';
import { fetchStooqUsQuote } from '@/lib/stooq-us-quote';
import { loadArgentineQuotes } from '@/lib/market-data/data912-client';
import type { Investment, InvestmentSale, InvestmentType } from '@/types/database';

export interface CreateInvestmentInput {
  userId: string;
  accountId: string;
  type: InvestmentType;
  ticker?: string;
  name: string;
  quantity: number;
  purchasePrice: number;
  purchaseCurrency: string;
  purchaseDate: string;
  maturityDate?: string;
  interestRate?: number;
  notes?: string;
  /** Override de moneda de cotización (USD/ARS). */
  marketCurrency?: string;
  /** Si true, el precio actual se carga a mano y no se refresca de la API. */
  isManualPrice?: boolean;
  /** Precio actual cargado a mano (requerido si isManualPrice). */
  currentPrice?: number;
}

export type PatchInvestmentInput = {
  accountId?: string;
  type?: InvestmentType;
  ticker?: string | null;
  name?: string;
  quantity?: number;
  purchasePrice?: number;
  purchaseCurrency?: string;
  purchaseDate?: string;
  maturityDate?: string | null;
  interestRate?: number | null;
  notes?: string;
  marketCurrency?: string | null;
  isManualPrice?: boolean;
  currentPrice?: number | null;
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
  /** Variación diaria del activo en %. NULL si no se pudo obtener. */
  daily_change_pct: number | null;
  /** P&L del día en USD para esta posición. 0 si no hay variación. */
  daily_pnl_usd: number;
  /** Ganancia realizada acumulada en USD por ventas previas. */
  realized_pnl_usd: number;
  /** Cantidad de ventas registradas para esta posición. */
  sales_count: number;
}

export interface SellPositionInput {
  userId: string;
  investmentId: string;
  quantity: number;
  price: number;
  currency: string;
  soldAt: string;
  notes?: string;
}

export interface SellPositionResult {
  sale: InvestmentSale;
  remainingQuantity: number;
  positionClosed: boolean;
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
  /** P&L del día agregado del portafolio (USD). */
  totalDailyPnLUsd: number;
  /** P&L del día como % sobre valor de mercado actual. */
  totalDailyPnLPercent: number;
  /** P&L del día en ARS equivalente (blue). */
  totalDailyPnLArsBlue: number;
  /** Ganancia realizada total del portafolio (USD), suma de todas las ventas. */
  totalRealizedPnLUsd: number;
  /** Ganancia realizada total en ARS equivalente (blue). */
  totalRealizedPnLArsBlue: number;
  byType: Array<{ type: string; count: number; value: number; pnl: number }>;
}

const STABLE_AS_USD = new Set(['USD', 'USDT', 'USDC', 'DAI', 'BUSD']);
const QUOTE_REFRESH_MS = 15 * 60 * 1000;

/**
 * Bonos argentinos cotizan POR VN 100 (lámina nominal de 100). El valor de tenencia es
 * `qty_VN × precio / 100`. Para acciones / CEDEARs / crypto el factor es 1 (precio por unidad).
 */
function priceFactorForType(type: InvestmentType): number {
  return type === 'bond' ? 100 : 1;
}

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

function marketCurrencyForInvestment(type: InvestmentType, purchaseCurrency: string | null): string {
  switch (type) {
    case 'stock_arg':
    case 'cedear':
      return 'ARS';
    case 'bond':
      // Bonos: precio de mercado en ARS salvo que el usuario haya comprado en USD (D/C).
      return (purchaseCurrency || 'ARS').toUpperCase();
    case 'stock_us':
    case 'etf':
    case 'crypto':
      return 'USD';
    default:
      return (purchaseCurrency || 'USD').toUpperCase();
  }
}

/** Yahoo symbol convention: stock_arg/cedear use `.BA`; resto va sin sufijo. */
function yahooSymbolFor(type: InvestmentType, ticker: string): string {
  const t = ticker.trim().toUpperCase();
  if (type === 'stock_arg' || type === 'cedear') {
    return t.endsWith('.BA') ? t : `${t}.BA`;
  }
  return t;
}

interface QuoteResult {
  price: number;
  changePct: number | null;
  currency: string;
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
  if (updates.maturityDate !== undefined) row.maturity_date = updates.maturityDate;
  if (updates.interestRate !== undefined) {
    row.interest_rate = updates.interestRate === null ? null : updates.interestRate;
  }
  if (updates.notes !== undefined) row.notes = updates.notes ?? null;
  if (updates.marketCurrency !== undefined) row.market_currency = updates.marketCurrency;
  if (updates.isManualPrice !== undefined) row.is_manual_price = updates.isManualPrice;
  if (updates.currentPrice !== undefined) {
    row.current_price = updates.currentPrice;
    // Precio cargado a mano: marcar como recién actualizado y limpiar variación diaria.
    row.current_price_updated_at = updates.currentPrice == null ? null : new Date().toISOString();
    row.current_price_change_pct = null;
  }
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
        type: input.type,
        ticker: input.ticker || null,
        name: input.name,
        quantity: input.quantity,
        purchase_price: input.purchasePrice,
        purchase_currency: input.purchaseCurrency,
        purchase_date: input.purchaseDate,
        maturity_date: input.maturityDate || null,
        interest_rate: input.interestRate || null,
        notes: input.notes || null,
        market_currency: input.marketCurrency || null,
        is_manual_price: input.isManualPrice ?? false,
        current_price: input.currentPrice ?? null,
        current_price_updated_at: input.currentPrice != null ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Pide precios para todos los tickers en una sola tanda por proveedor (batch real).
   * Estrategia: data912 (ARG/CEDEAR/bond) → Yahoo (US/ETF + fallback ARG) → Stooq (fallback US) → CoinGecko (crypto).
   * Devuelve un mapa `cacheKey -> QuoteResult` que se consume por posición.
   */
  private async refreshQuotesForInvestments(
    investments: Investment[]
  ): Promise<Map<string, QuoteResult>> {
    const out = new Map<string, QuoteResult>();

    const argSymbols: Array<{ type: 'stock_arg' | 'cedear' | 'bond'; ticker: string; cacheKey: string }> = [];
    const yahooSymbolToCacheKey = new Map<string, string>();
    const cryptoSymbols = new Set<string>();

    for (const inv of investments) {
      if (!inv.ticker) continue;
      const ticker = inv.ticker.trim().toUpperCase();
      if (inv.type === 'crypto') {
        cryptoSymbols.add(ticker);
        continue;
      }
      if (inv.type === 'stock_arg' || inv.type === 'cedear' || inv.type === 'bond') {
        argSymbols.push({ type: inv.type, ticker, cacheKey: `${inv.type}:${ticker}` });
        continue;
      }
      if (inv.type === 'stock_us' || inv.type === 'etf') {
        const ySym = yahooSymbolFor(inv.type, ticker);
        const key = `${inv.type}:${ticker}`;
        yahooSymbolToCacheKey.set(ySym, key);
      }
    }

    if (argSymbols.length > 0) {
      try {
        const arg = await loadArgentineQuotes();
        for (const { type, ticker, cacheKey } of argSymbols) {
          const src =
            type === 'stock_arg'
              ? arg.byStock
              : type === 'cedear'
                ? arg.byCedear
                : arg.byBond;
          const hit = src.get(ticker);
          if (hit && hit.price > 0) {
            out.set(cacheKey, {
              price: hit.price,
              changePct: hit.changePct,
              currency: hit.currency,
            });
          } else {
            // No matcheó data912: derivar a Yahoo .BA como fallback.
            yahooSymbolToCacheKey.set(yahooSymbolFor(type, ticker), cacheKey);
          }
        }
      } catch {
        // data912 abajo: todo a Yahoo fallback.
        for (const { type, ticker, cacheKey } of argSymbols) {
          yahooSymbolToCacheKey.set(yahooSymbolFor(type, ticker), cacheKey);
        }
      }
    }

    const yahooSymbols = Array.from(yahooSymbolToCacheKey.keys());
    if (yahooSymbols.length > 0) {
      const yMap = await fetchYahooStockQuotesMap(yahooSymbols);
      const missingForStooq: string[] = [];

      for (const [ySym, cacheKey] of yahooSymbolToCacheKey.entries()) {
        const q = yMap.get(ySym);
        if (q && q.price > 0) {
          out.set(cacheKey, {
            price: q.price,
            changePct: Number.isFinite(q.changePct) ? q.changePct : null,
            currency: q.currency,
          });
        } else {
          missingForStooq.push(ySym);
        }
      }

      for (const ySym of missingForStooq) {
        const cacheKey = yahooSymbolToCacheKey.get(ySym);
        if (!cacheKey) continue;
        if (ySym.endsWith('.BA')) continue;
        try {
          const stooq = await fetchStooqUsQuote(ySym);
          if (stooq && stooq.price > 0) {
            out.set(cacheKey, {
              price: stooq.price,
              changePct: Number.isFinite(stooq.changePct) ? stooq.changePct : null,
              currency: stooq.currency,
            });
          }
        } catch {
          /* sin Stooq: nos quedamos con el último precio guardado */
        }
      }
    }

    for (const sym of cryptoSymbols) {
      try {
        const q = await cotizacionesService.getCryptoQuote(sym);
        out.set(`crypto:${sym}`, {
          price: q.priceUSD,
          changePct: Number.isFinite(q.change24h) ? q.change24h : null,
          currency: 'USD',
        });
      } catch {
        /* sin crypto: nos quedamos con el último guardado */
      }
    }

    return out;
  }

  private async loadInvestmentsNormalized(
    userId: string,
    options?: { forceRefreshQuotes?: boolean; skipQuoteRefresh?: boolean }
  ): Promise<{ investments: InvestmentWithPnL[]; blueArsPerUsd: number }> {
    const supabase = createServiceClientSync();

    const dolar = await cotizacionesService.getDolarQuotes();
    const blueArsPerUsd = arsPerUsdFromDolar(dolar.blue);

    const { data: investmentsRaw, error } = await supabase
      .from('investments')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    const investments: Investment[] = investmentsRaw || [];

    const investmentIds = investments.map((inv) => inv.id);
    const salesByInvestment = new Map<string, { realized: number; count: number }>();
    if (investmentIds.length > 0) {
      const { data: salesRows } = await supabase
        .from('investment_sales')
        .select('investment_id, realized_pnl_usd')
        .eq('user_id', userId)
        .in('investment_id', investmentIds);
      for (const row of salesRows || []) {
        const cur = salesByInvestment.get(row.investment_id) || { realized: 0, count: 0 };
        cur.realized += Number(row.realized_pnl_usd) || 0;
        cur.count += 1;
        salesByInvestment.set(row.investment_id, cur);
      }
    }

    const now = Date.now();
    const needsRefresh = !options?.skipQuoteRefresh;
    const candidatesForRefresh = needsRefresh
      ? investments.filter((inv) => {
          if (!inv.ticker) return false;
          if (inv.is_manual_price) return false;
          if (options?.forceRefreshQuotes) return true;
          const lastUpdatedAt = inv.current_price_updated_at
            ? new Date(inv.current_price_updated_at).getTime()
            : 0;
          return !lastUpdatedAt || now - lastUpdatedAt > QUOTE_REFRESH_MS;
        })
      : [];

    const quoteMap = candidatesForRefresh.length
      ? await this.refreshQuotesForInvestments(candidatesForRefresh)
      : new Map<string, QuoteResult>();

    const updates: Array<{ id: string; price: number; changePct: number | null }> = [];

    const investmentsWithPnL: InvestmentWithPnL[] = investments.map((inv) => {
      let currentPrice = Number(inv.current_price ?? inv.purchase_price);
      let dailyChangePct: number | null =
        inv.current_price_change_pct == null ? null : Number(inv.current_price_change_pct);
      let liveCurrency: string | null = null;

      if (inv.ticker && !inv.is_manual_price) {
        const cacheKey = `${inv.type}:${inv.ticker.trim().toUpperCase()}`;
        const fresh = quoteMap.get(cacheKey);
        if (fresh && fresh.price > 0) {
          currentPrice = fresh.price;
          dailyChangePct = fresh.changePct;
          liveCurrency = fresh.currency;
          updates.push({ id: inv.id, price: fresh.price, changePct: fresh.changePct });
        }
      }

      const qty = Number(inv.quantity);
      const purchaseUnit = Number(inv.purchase_price);
      const purchaseCur = (inv.purchase_currency || 'USD').toUpperCase();
      // Moneda de mercado: override manual del usuario > moneda real de la cotización
      // en vivo (no para bonos: data912 hardcodea ARS y rompería un bono en USD) >
      // default por tipo.
      const typeDefaultCur = marketCurrencyForInvestment(inv.type, inv.purchase_currency);
      const autoCur = inv.type !== 'bond' ? liveCurrency : null;
      const marketCur = (inv.market_currency || autoCur || typeDefaultCur).toUpperCase();
      const priceFactor = priceFactorForType(inv.type);

      const costNative = (qty * purchaseUnit) / priceFactor;
      const marketNative = (qty * currentPrice) / priceFactor;

      const costUsd = amountToUsd(costNative, purchaseCur, blueArsPerUsd);
      const marketUsd = amountToUsd(marketNative, marketCur, blueArsPerUsd);
      const pnlUsd = marketUsd - costUsd;
      const pnlPctUsd = costUsd > 0 ? (pnlUsd / costUsd) * 100 : 0;

      let dailyPnlUsd = 0;
      if (dailyChangePct != null && Number.isFinite(dailyChangePct)) {
        const denom = 100 + dailyChangePct;
        if (denom !== 0) {
          const previousMarketNative = marketNative * (100 / denom);
          const previousMarketUsd = amountToUsd(previousMarketNative, marketCur, blueArsPerUsd);
          dailyPnlUsd = marketUsd - previousMarketUsd;
        }
      }

      const realizedAgg = salesByInvestment.get(inv.id) || { realized: 0, count: 0 };

      return {
        ...inv,
        quantity: qty,
        purchase_price: purchaseUnit,
        current_price: currentPrice,
        current_price_change_pct: dailyChangePct,
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
        daily_change_pct: dailyChangePct,
        daily_pnl_usd: dailyPnlUsd,
        realized_pnl_usd: realizedAgg.realized,
        sales_count: realizedAgg.count,
      };
    });

    if (updates.length > 0) {
      const nowIso = new Date().toISOString();
      await Promise.all(
        updates.map((u) =>
          supabase
            .from('investments')
            .update({
              current_price: u.price,
              current_price_updated_at: nowIso,
              current_price_change_pct: u.changePct,
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

  /**
   * Registra una venta (parcial o total) de una posición.
   * Calcula ganancia realizada en USD usando el dólar blue actual y baja `quantity` del investment.
   * Si la cantidad restante llega a 0, marca la posición como archivada.
   */
  async sell(input: SellPositionInput): Promise<SellPositionResult> {
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new Error('La cantidad a vender debe ser mayor a 0.');
    }
    if (!Number.isFinite(input.price) || input.price <= 0) {
      throw new Error('El precio de venta debe ser mayor a 0.');
    }

    const supabase = createServiceClientSync();

    const { data: invRow, error: invErr } = await supabase
      .from('investments')
      .select('*')
      .eq('id', input.investmentId)
      .eq('user_id', input.userId)
      .single();

    if (invErr || !invRow) {
      throw new Error('Posición no encontrada');
    }

    const currentQty = Number(invRow.quantity);
    const purchasePrice = Number(invRow.purchase_price);

    if (input.quantity > currentQty + 1e-9) {
      throw new Error(`No podés vender más de lo que tenés (${currentQty}).`);
    }

    const dolar = await cotizacionesService.getDolarQuotes();
    const arsPerUsd = arsPerUsdFromDolar(dolar.blue);

    const saleCurrency = (input.currency || invRow.purchase_currency || 'USD').toUpperCase();
    const basisCurrency = (invRow.purchase_currency || saleCurrency).toUpperCase();
    const priceFactor = priceFactorForType(invRow.type as InvestmentType);
    // La moneda de venta puede diferir de la de compra (el diálogo deja elegir).
    // Pasamos ambos precios a USD antes de restar para no mezclar monedas
    // (restar un precio ARS de uno USD daba un P&L disparatado).
    const saleUsdPerUnit = amountToUsd(input.price, saleCurrency, arsPerUsd);
    const purchaseUsdPerUnit = amountToUsd(purchasePrice, basisCurrency, arsPerUsd);
    const realizedUsd = ((saleUsdPerUnit - purchaseUsdPerUnit) * input.quantity) / priceFactor;
    const realizedNative =
      saleCurrency === 'ARS' ? usdToArsBlue(realizedUsd, arsPerUsd) : realizedUsd;

    const { data: saleInserted, error: saleErr } = await supabase
      .from('investment_sales')
      .insert({
        user_id: input.userId,
        investment_id: input.investmentId,
        quantity: input.quantity,
        price: input.price,
        currency: saleCurrency,
        sold_at: input.soldAt,
        purchase_price_at_sale: purchasePrice,
        realized_pnl_native: realizedNative,
        realized_pnl_usd: realizedUsd,
        ars_per_usd: arsPerUsd,
        notes: input.notes ?? null,
      })
      .select()
      .single();

    if (saleErr || !saleInserted) {
      throw new Error(saleErr?.message || 'No se pudo registrar la venta');
    }

    const remainingQuantity = Math.max(0, currentQty - input.quantity);
    const positionClosed = remainingQuantity <= 1e-9;

    const updatePayload: Record<string, unknown> = {
      quantity: positionClosed ? 0 : remainingQuantity,
    };
    if (positionClosed) {
      updatePayload.is_active = false;
    }

    const { error: updErr } = await supabase
      .from('investments')
      .update(updatePayload)
      .eq('id', input.investmentId)
      .eq('user_id', input.userId);

    if (updErr) {
      // Rollback manual: borrar la venta para que el estado quede consistente.
      await supabase.from('investment_sales').delete().eq('id', saleInserted.id);
      throw new Error(updErr.message);
    }

    return {
      sale: saleInserted as InvestmentSale,
      remainingQuantity: positionClosed ? 0 : remainingQuantity,
      positionClosed,
    };
  }

  async listSales(userId: string, investmentId?: string): Promise<InvestmentSale[]> {
    const supabase = createServiceClientSync();
    let query = supabase
      .from('investment_sales')
      .select('*')
      .eq('user_id', userId)
      .order('sold_at', { ascending: false });

    if (investmentId) {
      query = query.eq('investment_id', investmentId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data || []) as InvestmentSale[];
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
    options?: { forceRefreshQuotes?: boolean; skipDailySnapshot?: boolean; skipQuoteRefresh?: boolean }
  ): Promise<PortfolioSummaryPayload> {
    const { investments, blueArsPerUsd } = await this.loadInvestmentsNormalized(userId, options);

    const totalCurrentValue = investments.reduce((sum, inv) => sum + inv.market_value_usd, 0);
    const totalPurchaseValue = investments.reduce((sum, inv) => sum + inv.cost_basis_usd, 0);
    const totalPnL = totalCurrentValue - totalPurchaseValue;
    const totalPnLPercent = totalPurchaseValue > 0 ? (totalPnL / totalPurchaseValue) * 100 : 0;

    const totalDailyPnLUsd = investments.reduce((sum, inv) => sum + (inv.daily_pnl_usd || 0), 0);
    const previousValueUsd = totalCurrentValue - totalDailyPnLUsd;
    const totalDailyPnLPercent =
      previousValueUsd > 0 ? (totalDailyPnLUsd / previousValueUsd) * 100 : 0;

    const totalCurrentValueArsBlue = usdToArsBlue(totalCurrentValue, blueArsPerUsd);
    const totalPurchaseValueArsBlue = usdToArsBlue(totalPurchaseValue, blueArsPerUsd);
    const totalPnLArsBlue = usdToArsBlue(totalPnL, blueArsPerUsd);
    const totalDailyPnLArsBlue = usdToArsBlue(totalDailyPnLUsd, blueArsPerUsd);

    const supabase = createServiceClientSync();
    const { data: allSales } = await supabase
      .from('investment_sales')
      .select('realized_pnl_usd')
      .eq('user_id', userId);
    const totalRealizedPnLUsd = (allSales || []).reduce(
      (sum, row) => sum + (Number(row.realized_pnl_usd) || 0),
      0
    );
    const totalRealizedPnLArsBlue = usdToArsBlue(totalRealizedPnLUsd, blueArsPerUsd);

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
      totalDailyPnLUsd,
      totalDailyPnLPercent,
      totalDailyPnLArsBlue,
      totalRealizedPnLUsd,
      totalRealizedPnLArsBlue,
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
