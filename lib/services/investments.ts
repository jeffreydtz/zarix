import { randomUUID } from 'node:crypto';
import { ApiError } from '@/lib/api-handler';
import { transactionRequestHash, validTransactionRequestId } from '@/lib/transaction-idempotency';
import { nextFinancialRequestId } from '@/lib/financial-request-context';
import { createServiceClientSync } from '@/lib/supabase/server';
import { cotizacionesService } from './cotizaciones';
import { FxUnavailableError, isExecutableDolarQuote, requireExecutableDolarQuote } from '@/lib/executable-fx';
import { blueFxReference, type BlueFxReference } from '@/lib/blue-fx-reference';
import type { Account, Investment, InvestmentSale, InvestmentType } from '@/types/database';
import {
  accountCanHoldPosition,
  marketCurrencyForInvestment,
  priceFactorForType,
} from '@/lib/investments/type-meta';
import {
  InvestmentQuoteMap,
  quoteCacheKeyForPosition,
  refreshQuotesForInvestments,
  type QuoteResult,
} from '@/lib/market-data/quote-refresh';
import {
  composeComposition,
  periodChangeFromSnapshots,
  rankGainersLosers,
  type PeriodChange,
} from '@/lib/investments/portfolio-analytics';

export interface CreateInvestmentInput {
  requestId?: string;
  userId: string;
  accountId: string;
  type: InvestmentType;
  ticker?: string;
  name: string;
  quantity: number;
  purchasePrice: number;
  purchaseCurrency: string;
  purchaseDate?: string | null;
  maturityDate?: string;
  interestRate?: number;
  notes?: string;
  /** Override de moneda de cotización (USD/ARS). */
  marketCurrency?: string;
  paymentCurrency?: string | null;
  law?: string | null;
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
  purchaseDate?: string | null;
  maturityDate?: string | null;
  interestRate?: number | null;
  notes?: string;
  marketCurrency?: string | null;
  paymentCurrency?: string | null;
  law?: string | null;
  isManualPrice?: boolean;
  currentPrice?: number | null;
};

export interface InvestmentWithPnL extends Investment {
  /** Diferencia precio confirmado/caché de la referencia inicial de compra. */
  valuation_price_source: 'live' | 'estimate' | 'manual' | 'cache' | 'purchase_reference';
  current_value_native: number;
  fxUnavailable?: boolean;
  fxStale?: boolean;
  fxAsOf?: string | null;
  current_value: number | null;
  profit_loss: number | null;
  profit_loss_percent: number | null;
  /** Moneda del precio de mercado actual (cotización). */
  market_price_currency: string;
  cost_basis_usd: number | null;
  market_value_usd: number | null;
  profit_loss_usd: number | null;
  profit_loss_percent_usd: number | null;
  market_value_ars_blue: number | null;
  /** Variación diaria del activo en %. NULL si no se pudo obtener. */
  daily_change_pct: number | null;
  /** P&L del día en USD para esta posición. 0 si no hay variación. */
  daily_pnl_usd: number | null;
  /** Ganancia realizada acumulada en USD por ventas previas. */
  realized_pnl_usd: number;
  /** Cantidad de ventas registradas para esta posición. */
  sales_count: number;
}

export interface SellPositionInput {
  requestId?: string;
  userId: string;
  investmentId: string;
  quantity: number;
  price: number;
  currency: string;
  soldAt?: string;
  notes?: string;
}

export interface SellPositionResult {
  sale: InvestmentSale;
  remainingQuantity: number;
  positionClosed: boolean;
}

export interface PortfolioSummaryPayload {
  investments: InvestmentWithPnL[];
  fxUnavailable?: boolean;
  fxStale?: boolean;
  fxAsOf?: string | null;
  /** Valor de mercado total en USD (ARS convertido con dólar blue venta). */
  totalCurrentValue: number | null;
  /** Capital invertido (costo) en USD, misma convención. */
  totalPurchaseValue: number | null;
  totalPnL: number | null;
  totalPnLPercent: number | null;
  /** Cotización blue usada (ARS por 1 USD). */
  blueArsPerUsd: number | null;
  /** Exact FX reference used here; distinct from the price source of each asset. */
  blueReference?: BlueFxReference;
  /** Equivalentes en ARS (referencia blue). */
  totalCurrentValueArsBlue: number | null;
  totalPurchaseValueArsBlue: number | null;
  totalPnLArsBlue: number | null;
  /** P&L del día agregado del portafolio (USD). */
  totalDailyPnLUsd: number | null;
  /** P&L del día como % sobre valor de mercado actual. */
  totalDailyPnLPercent: number | null;
  /** P&L del día en ARS equivalente (blue). */
  totalDailyPnLArsBlue: number | null;
  /** Ganancia realizada total del portafolio (USD), suma de todas las ventas. */
  totalRealizedPnLUsd: number;
  /** Ganancia realizada total en ARS equivalente (blue). */
  totalRealizedPnLArsBlue: number | null;
  byType: Array<{ type: string; count: number; value: number; pnl: number }>;
  byCurrency: Array<{ type: string; count: number; value: number; pnl: number }>;
  weeklyChange: PeriodChange | null;
  monthlyChange: PeriodChange | null;
  topGainers: Array<{
    id: string;
    name: string;
    ticker: string | null;
    type: InvestmentType;
    profit_loss_usd: number;
    profit_loss_percent_usd: number;
    market_value_usd: number;
  }>;
  topLosers: Array<{
    id: string;
    name: string;
    ticker: string | null;
    type: InvestmentType;
    profit_loss_usd: number;
    profit_loss_percent_usd: number;
    market_value_usd: number;
  }>;
}

const STABLE_AS_USD = new Set(['USD', 'USDT', 'USDC', 'DAI', 'BUSD']);
const QUOTE_REFRESH_MS = 15 * 60 * 1000;

function arsPerUsdFromDolar(blue: { sell: number; buy: number } | undefined): number {
  if (!blue) throw new FxUnavailableError('blue ARS/USD');
  if (Number.isFinite(blue.sell) && blue.sell > 0) return blue.sell;
  if (Number.isFinite(blue.buy) && blue.buy > 0) return blue.buy;
  throw new FxUnavailableError('blue ARS/USD');
}

function amountToUsd(
  amount: number,
  currency: string | null | undefined,
  arsPerUsd: number | null,
  extraUsdPerUnit?: Map<string, number>
): number {
  const c = (currency || 'USD').toUpperCase();
  if (STABLE_AS_USD.has(c)) return amount;
  if (c === 'ARS') {
    if (arsPerUsd == null || !Number.isFinite(arsPerUsd) || arsPerUsd <= 0) throw new FxUnavailableError('ARS/USD');
    return amount / arsPerUsd;
  }
  if (extraUsdPerUnit) {
    const extra = extraUsdPerUnit.get(c);
    if (extra != null && Number.isFinite(extra) && extra > 0) return amount * extra;
  }
  throw new FxUnavailableError(`${c}/USD`);
}

function usdToArsBlue(usd: number, arsPerUsd: number): number {
  if (arsPerUsd == null || !Number.isFinite(arsPerUsd) || arsPerUsd <= 0) throw new FxUnavailableError('ARS/USD');
  return usd * arsPerUsd;
}

function availableValue(calculate: () => number): number | null {
  try {
    const value = calculate();
    return Number.isFinite(value) ? value : null;
  } catch (error) {
    if (!(error instanceof FxUnavailableError)) throw error;
    return null;
  }
}

function sumValuations(values: Array<number | null>): number | null {
  return values.every((value): value is number => value != null && Number.isFinite(value))
    ? values.reduce((total, value) => total + value, 0) : null;
}

async function loadOwnedActiveAccount(
  supabase: ReturnType<typeof createServiceClientSync>,
  accountId: string,
  userId: string
): Promise<{ id: string; type: Account['type']; is_active: boolean | null }> {
  const { data, error } = await supabase
    .from('accounts')
    .select('id, type, is_active')
    .eq('id', accountId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.is_active) {
    throw new ApiError('Cuenta no encontrada', 404);
  }
  return data;
}

async function assertOwnedPositionAccount(
  supabase: ReturnType<typeof createServiceClientSync>,
  accountId: string,
  userId: string,
  positionType: InvestmentType
): Promise<void> {
  const data = await loadOwnedActiveAccount(supabase, accountId, userId);
  if (accountCanHoldPosition(data.type, positionType)) return;
  throw new ApiError('La cuenta tiene que ser de tipo inversión (o cripto para posiciones cripto)', 400);
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
  if (updates.paymentCurrency !== undefined) row.payment_currency = updates.paymentCurrency;
  if (updates.law !== undefined) row.law = updates.law;
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
    input = { ...input, requestId: input.requestId ?? nextFinancialRequestId() };
    if (!Number.isFinite(input.quantity) || input.quantity <= 0 ||
        !Number.isFinite(input.purchasePrice) || input.purchasePrice <= 0) {
      throw new Error('La cantidad y el precio de compra deben ser finitos y mayores a cero.');
    }
    if (input.isManualPrice &&
        (input.currentPrice == null || !Number.isFinite(input.currentPrice) || input.currentPrice <= 0)) {
      throw new Error('El precio manual debe ser finito y mayor a cero.');
    }
    const supabase = createServiceClientSync();
    const requestId = input.requestId ?? randomUUID();
    if (!validTransactionRequestId(requestId)) throw new ApiError('Identificador de solicitud inválido.');
    const requestHash = transactionRequestHash(input as unknown as Record<string, unknown>);
    if (input.requestId) {
      const { data: prior, error } = await supabase.from('investment_create_requests')
        .select('request_hash, response').eq('user_id', input.userId).eq('request_id', requestId).maybeSingle();
      if (error) throw error;
      if (prior) {
        if (prior.request_hash !== requestHash) throw new ApiError('La solicitud ya se usó con otros datos.', 409);
        return prior.response as Investment;
      }
    }
    await assertOwnedPositionAccount(supabase, input.accountId, input.userId, input.type);

    const { data, error } = await supabase.rpc('create_investment_once', {
      p_user_id: input.userId, p_request_id: requestId, p_request_hash: requestHash,
      p_investment: {
        user_id: input.userId,
        account_id: input.accountId,
        type: input.type,
        ticker: input.ticker || null,
        name: input.name,
        quantity: input.quantity,
        purchase_price: input.purchasePrice,
        purchase_currency: input.purchaseCurrency,
        purchase_date: input.purchaseDate || null,
        maturity_date: input.maturityDate || null,
        interest_rate: input.interestRate ?? null,
        notes: input.notes || null,
        market_currency: input.marketCurrency || null,
        payment_currency: input.paymentCurrency || null,
        law: input.law || null,
        is_manual_price: input.isManualPrice ?? false,
        current_price: input.currentPrice ?? null,
        current_price_updated_at: input.currentPrice != null ? new Date().toISOString() : null,
      },
    });
    if (error?.code === 'Z0001') throw new ApiError('La solicitud ya se usó con otros datos.', 409);
    if (error) throw error;
    if (!data?.id) throw new Error('No se pudo confirmar la inversión.');
    return data as Investment;
  }

  /**
   * Pide precios respetando market_currency (rueda D o conversión MEP).
   * data912 (ARG/CEDEAR/bono/ON) → CAFCI (FCI) → Yahoo `.BA` → Stooq → CoinGecko.
   */
  private async refreshQuotesForInvestments(
    investments: Investment[]
  ): Promise<InvestmentQuoteMap> {
    return refreshQuotesForInvestments(investments, { allowStaleFx: true });
  }

  private async loadInvestmentsNormalized(
    userId: string,
    options?: { forceRefreshQuotes?: boolean; skipQuoteRefresh?: boolean }
  ): Promise<{ investments: InvestmentWithPnL[]; blueArsPerUsd: number | null; blueReference?: BlueFxReference; fxStale: boolean; fxAsOf: string | null }> {
    const supabase = createServiceClientSync();

    const dolar = await cotizacionesService.getDolarQuotes({ require: ['blue'] }).catch(error => {
      if (!(error instanceof FxUnavailableError)) throw error;
      return null;
    });
    const blue = dolar?.blue;
    const blueArsPerUsd = availableValue(() => arsPerUsdFromDolar(blue));
    const reference = blue && blueArsPerUsd != null
      ? blueFxReference(blue, blue.sell > 0 && Number.isFinite(blue.sell) ? 'sell' : 'buy') : undefined;
    const fxStale = Boolean(blue?.stale) || (blue != null && !isExecutableDolarQuote(blue, 'blue'));
    const observedAt = blue?.asOf ?? blue?.timestamp;
    const fxAsOf = observedAt && Number.isFinite(new Date(observedAt).getTime())
      ? new Date(observedAt).toISOString() : null;

    const { data: investmentsRaw, error } = await supabase
      .from('investments')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    const investments: Investment[] = investmentsRaw || [];

    const extraUsd = new Map<string, number>();
    const needed = new Set<string>();
    for (const inv of investments) {
      needed.add((inv.purchase_currency || 'USD').toUpperCase());
      needed.add(
        (inv.market_currency || marketCurrencyForInvestment(inv.type, inv.purchase_currency)).toUpperCase()
      );
    }
    for (const c of needed) {
      if (STABLE_AS_USD.has(c) || c === 'ARS' || extraUsd.has(c)) continue;
      try {
        extraUsd.set(c, await cotizacionesService.getExchangeRate(c, 'USD'));
      } catch (error) {
        if (!(error instanceof FxUnavailableError)) throw error;
        /* amountToUsd rechazará la valoración; no inventar un valor cero. */
      }
    }

    const investmentIds = investments.map((inv) => inv.id);
    const salesByInvestment = new Map<string, { realized: number; count: number }>();
    if (investmentIds.length > 0) {
      const { data: salesRows, error: salesError } = await supabase
        .from('investment_sales')
        .select('investment_id, realized_pnl_usd')
        .eq('user_id', userId)
        .in('investment_id', investmentIds);
      if (salesError) throw salesError;
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
      : new InvestmentQuoteMap();

    const updates: Array<QuoteResult & { id: string }> = [];

    const investmentsWithPnL: InvestmentWithPnL[] = investments.map((inv) => {
      let currentPrice = Number(inv.current_price ?? inv.purchase_price);
      let priceSource: InvestmentWithPnL['valuation_price_source'] = inv.current_price == null
        ? 'purchase_reference' : inv.is_manual_price ? 'manual' : 'cache';
      let priceUpdatedAt = inv.current_price == null ? null : inv.current_price_updated_at;
      let dailyChangePct: number | null =
        inv.current_price_change_pct == null ? null : Number(inv.current_price_change_pct);
      let liveCurrency: string | null = null;
      let positionFxStale = fxStale;
      let positionFxAsOf = fxAsOf;
      const cacheKey = quoteCacheKeyForPosition(inv);
      const requiredFxUnavailable = cacheKey != null && quoteMap.unavailableFxKeys.has(cacheKey);
      let fresh: QuoteResult | undefined;

      if (inv.ticker && !inv.is_manual_price) {
        fresh = cacheKey ? quoteMap.get(cacheKey) : undefined;
        if (fresh && fresh.price > 0) {
          currentPrice = fresh.price;
          dailyChangePct = fresh.changePct;
          liveCurrency = fresh.currency;
          priceSource = fresh.fxStale ? 'estimate' : 'live';
          positionFxStale ||= Boolean(fresh.fxStale);
          if (fresh.fxAsOf && (!positionFxAsOf || fresh.fxAsOf < positionFxAsOf)) positionFxAsOf = fresh.fxAsOf;
          priceUpdatedAt = fresh.timestamp;
          updates.push({ id: inv.id, ...fresh });
        }
      }

      const qty = Number(inv.quantity);
      const purchaseUnit = Number(inv.purchase_price);
      const purchaseCur = (inv.purchase_currency || 'USD').toUpperCase();
      // La referencia de compra conserva la moneda de compra. Una cotización
      // confirmada conserva la moneda del proveedor, también para bonos: no
      // se reetiqueta un precio ARS como USD por el tipo o la preferencia.
      const typeDefaultCur = marketCurrencyForInvestment(inv.type, inv.purchase_currency);
      const marketCur = (priceSource === 'purchase_reference' ? purchaseCur
        : liveCurrency || inv.market_currency || typeDefaultCur).trim().toUpperCase();
      const priceFactor = priceFactorForType(inv.type);

      const costNative = (qty * purchaseUnit) / priceFactor;
      const marketNative = (qty * currentPrice) / priceFactor;
      const pnlPrice = liveCurrency ? (fresh?.sourcePrice ?? currentPrice) : currentPrice;
      const pnlCurrency = (
        liveCurrency && fresh?.sourceCurrency ? fresh.sourceCurrency : marketCur
      ).trim().toUpperCase();
      const marketNativeForPnl = (qty * pnlPrice) / priceFactor;

      const costUsd = availableValue(() => amountToUsd(costNative, purchaseCur, blueArsPerUsd, extraUsd));
      const marketUsd = availableValue(() => amountToUsd(marketNativeForPnl, pnlCurrency, blueArsPerUsd, extraUsd));
      const pnlUsd = marketUsd != null && costUsd != null ? marketUsd - costUsd : null;
      const pnlPctUsd = pnlUsd != null && costUsd != null ? (costUsd > 0 ? (pnlUsd / costUsd) * 100 : 0) : null;

      let dailyPnlUsd: number | null = marketUsd == null ? null : 0;
      if (marketUsd != null && dailyChangePct != null && Number.isFinite(dailyChangePct)) {
        const denom = 100 + dailyChangePct;
        if (denom !== 0) {
          const previousMarketNative = marketNativeForPnl * (100 / denom);
          const previousMarketUsd = availableValue(() => amountToUsd(previousMarketNative, pnlCurrency, blueArsPerUsd, extraUsd));
          dailyPnlUsd = previousMarketUsd != null ? marketUsd - previousMarketUsd : null;
        }
      }

      const realizedAgg = salesByInvestment.get(inv.id) || { realized: 0, count: 0 };

      return {
        ...inv,
        quantity: qty,
        purchase_price: purchaseUnit,
        current_price: currentPrice,
        current_price_updated_at: priceUpdatedAt,
        valuation_price_source: priceSource,
        current_price_change_pct: dailyChangePct,
        interest_rate: inv.interest_rate ? Number(inv.interest_rate) : null,
        market_price_currency: marketCur,
        cost_basis_usd: costUsd,
        market_value_usd: marketUsd,
        profit_loss_usd: pnlUsd,
        profit_loss_percent_usd: pnlPctUsd,
        market_value_ars_blue: marketCur === 'ARS' ? marketNative
          : marketUsd != null && blueArsPerUsd != null ? usdToArsBlue(marketUsd, blueArsPerUsd) : null,
        current_value_native: marketNative,
        fxUnavailable: blueArsPerUsd == null || costUsd == null || marketUsd == null || requiredFxUnavailable,
        fxStale: positionFxStale,
        fxAsOf: positionFxAsOf,
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
      await Promise.all(
        updates.map(async (u) => {
          // Display estimates must not lose their FX provenance in stored prices.
          if (u.fxStale) return;
          const { error: updateError } = await supabase
            .from('investments')
            .update({
              current_price: u.price,
              current_price_updated_at: u.timestamp,
              current_price_change_pct: u.changePct,
              market_currency: u.currency.trim().toUpperCase(),
            })
            .eq('id', u.id);
          if (updateError) throw updateError;
        })
      );
    }

    const usedAsOf = investmentsWithPnL.map(inv => inv.fxAsOf).filter((asOf): asOf is string => Boolean(asOf));
    return { investments: investmentsWithPnL, blueArsPerUsd, blueReference: reference,
      fxStale: fxStale || investmentsWithPnL.some(inv => inv.fxStale),
      fxAsOf: usedAsOf.sort()[0] ?? fxAsOf };
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
    if ((updates.quantity !== undefined && (!Number.isFinite(updates.quantity) || updates.quantity <= 0)) ||
        (updates.purchasePrice !== undefined && (!Number.isFinite(updates.purchasePrice) || updates.purchasePrice <= 0)) ||
        (updates.currentPrice != null && (!Number.isFinite(updates.currentPrice) || updates.currentPrice <= 0))) {
      throw new Error('La cantidad y los precios deben ser finitos y mayores a cero.');
    }
    const supabase = createServiceClientSync();
    const row = mapPatchToRow(updates);
    if (Object.keys(row).length === 0) {
      throw new Error('No hay campos para actualizar');
    }
    if (typeof row.account_id === 'string') {
      const account = await loadOwnedActiveAccount(supabase, row.account_id, userId);
      if (account.type === 'investment') {
        // Any instrument may live on an investment account.
      } else if (account.type === 'crypto') {
        const positionType = (row.type as InvestmentType | undefined)
          ?? (await this.getById(id, userId)).type;
        if (positionType !== 'crypto') {
          throw new ApiError(
            'La cuenta tiene que ser de tipo inversión (o cripto para posiciones cripto)',
            400
          );
        }
      } else {
        throw new ApiError(
          'La cuenta tiene que ser de tipo inversión (o cripto para posiciones cripto)',
          400
        );
      }
    }

    const { data, error } = await supabase
      .from('investments')
      .update(row)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    // Primary-key + owner filters can match at most one row.
    if (error?.code === 'PGRST116') throw new ApiError('Inversión no encontrada', 404);
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
    input = { ...input, requestId: input.requestId ?? nextFinancialRequestId() };
    if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
      throw new Error('La cantidad a vender debe ser mayor a 0.');
    }
    if (!Number.isFinite(input.price) || input.price <= 0) {
      throw new Error('El precio de venta debe ser mayor a 0.');
    }

    const supabase = createServiceClientSync();
    const requestHash = transactionRequestHash(input as unknown as Record<string, unknown>);
    if (input.requestId) {
      if (!validTransactionRequestId(input.requestId)) throw new ApiError('Identificador de solicitud inválido.');
      const { data: prior, error } = await supabase.from('investment_sale_requests')
        .select('request_hash, response').eq('user_id', input.userId).eq('request_id', input.requestId).maybeSingle();
      if (error) throw error;
      if (prior) {
        if (prior.request_hash !== requestHash) throw new ApiError('La solicitud ya se usó con otros datos.', 409);
        return { sale: prior.response.sale, remainingQuantity: Number(prior.response.remaining_quantity),
          positionClosed: Boolean(prior.response.position_closed) };
      }
    }


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

    // Validación temprana para un mensaje amigable; la garantía real contra
    // oversell (doble click / ventas concurrentes) la da el RPC atómico.
    if (input.quantity > currentQty + 1e-9) {
      throw new ApiError(`No podés vender más de lo que tenés (${currentQty}).`);
    }

    const dolar = await cotizacionesService.getDolarQuotes({ require: ['blue'], executable: true });
    const arsPerUsd = arsPerUsdFromDolar(requireExecutableDolarQuote(dolar.blue, 'blue ARS/USD', 'blue'));

    const saleCurrency = (input.currency || invRow.purchase_currency || 'USD').toUpperCase();
    const basisCurrency = (invRow.purchase_currency || saleCurrency).toUpperCase();
    const priceFactor = priceFactorForType(invRow.type as InvestmentType);
    // La moneda de venta puede diferir de la de compra (el diálogo deja elegir).
    // Pasamos ambos precios a USD antes de restar para no mezclar monedas
    // (restar un precio ARS de uno USD daba un P&L disparatado).
    const extra = new Map<string, number>();
    for (const c of [saleCurrency, basisCurrency]) {
      if (!STABLE_AS_USD.has(c) && c !== 'ARS' && !extra.has(c)) {
        extra.set(c, await cotizacionesService.getExchangeRate(c, 'USD'));
      }
    }
    const saleUsdPerUnit = amountToUsd(input.price, saleCurrency, arsPerUsd, extra);
    const purchaseUsdPerUnit = amountToUsd(purchasePrice, basisCurrency, arsPerUsd, extra);
    const realizedUsd = ((saleUsdPerUnit - purchaseUsdPerUnit) * input.quantity) / priceFactor;
    // Native se expresa en la moneda de la venta, también si es EUR/crypto:
    // no guardar un importe USD etiquetado con otra moneda.
    const saleUsdPerCurrencyUnit = amountToUsd(1, saleCurrency, arsPerUsd, extra);
    const realizedNative = realizedUsd / saleUsdPerCurrencyUnit;

    // RPC atómico (una transacción): descuenta quantity SOLO si alcanza e
    // inserta la venta. Elimina la carrera lectura-validación-escritura que
    // permitía sobrevender con dos requests simultáneos.
    const saleParameters = {
      p_user_id: input.userId,
      p_investment_id: input.investmentId,
      p_quantity: input.quantity,
      p_price: input.price,
      p_currency: saleCurrency,
      p_sold_at: input.soldAt ?? new Date().toISOString().split('T')[0],
      p_realized_pnl_native: realizedNative,
      p_realized_pnl_usd: realizedUsd,
      p_ars_per_usd: arsPerUsd,
      p_notes: input.notes ?? null,
      // These exact basis fields are checked while the SQL row lock is held.
      // Provider IO above must never let a concurrent edit change the sale basis.
      p_expected_purchase_price: invRow.purchase_price,
      p_expected_purchase_currency: invRow.purchase_currency,
      p_expected_type: invRow.type,
    };
    const { data: rpcData, error: rpcErr } = await supabase.rpc('sell_investment_once', {
      p_user_id: input.userId, p_request_id: input.requestId ?? randomUUID(),
      p_request_hash: requestHash, p_sale: saleParameters,
    });
    if (rpcErr?.code === 'Z0001') throw new ApiError('La solicitud ya se usó con otros datos.', 409);
    if (rpcErr?.code === 'Z0002') {
      throw new ApiError('La base de compra cambió mientras se calculaba la venta. Reintentá la misma solicitud para actualizar el cálculo.', 409);
    }

    if (rpcErr) {
      if (rpcErr.message?.includes('CANTIDAD_INSUFICIENTE')) {
        throw new ApiError(
          'No podés vender más de lo que tenés (la posición cambió o ya se vendió en otra operación).'
        );
      }
      if (rpcErr.message?.includes('CANTIDAD_INVALIDA')) {
        throw new Error('La cantidad a vender debe ser mayor a 0.');
      }
      if (rpcErr.message?.includes('PRECIO_INVALIDO')) {
        throw new Error('El precio de venta debe ser mayor a 0.');
      }
      throw new Error(rpcErr.message || 'No se pudo registrar la venta');
    }

    const payload = rpcData as {
      sale: InvestmentSale;
      remaining_quantity: number | string;
      position_closed: boolean;
    } | null;

    if (!payload?.sale) {
      throw new Error('No se pudo registrar la venta');
    }

    return {
      sale: payload.sale,
      remainingQuantity: Number(payload.remaining_quantity ?? 0),
      positionClosed: Boolean(payload.position_closed),
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
    const { investments, blueArsPerUsd, blueReference, fxStale, fxAsOf } = await this.loadInvestmentsNormalized(userId, options);

    const totalCurrentValue = sumValuations(investments.map(inv => inv.market_value_usd));
    const totalPurchaseValue = sumValuations(investments.map(inv => inv.cost_basis_usd));
    const totalPnL = totalCurrentValue != null && totalPurchaseValue != null
      ? totalCurrentValue - totalPurchaseValue : null;
    const totalPnLPercent = totalPnL != null && totalPurchaseValue != null
      ? (totalPurchaseValue > 0 ? (totalPnL / totalPurchaseValue) * 100 : 0) : null;

    const totalDailyPnLUsd = sumValuations(investments.map(inv => inv.daily_pnl_usd));
    const previousValueUsd = totalCurrentValue != null && totalDailyPnLUsd != null
      ? totalCurrentValue - totalDailyPnLUsd : null;
    const totalDailyPnLPercent = previousValueUsd != null && totalDailyPnLUsd != null
      ? (previousValueUsd > 0 ? (totalDailyPnLUsd / previousValueUsd) * 100 : 0) : null;
    const toArs = (value: number | null) => value != null && blueArsPerUsd != null
      ? usdToArsBlue(value, blueArsPerUsd) : null;
    const totalCurrentValueArsBlue = toArs(totalCurrentValue);
    const totalPurchaseValueArsBlue = toArs(totalPurchaseValue);
    const totalPnLArsBlue = toArs(totalPnL);
    const totalDailyPnLArsBlue = toArs(totalDailyPnLUsd);

    const supabase = createServiceClientSync();
    const { data: allSales, error: allSalesError } = await supabase
      .from('investment_sales')
      .select('realized_pnl_usd')
      .eq('user_id', userId);
    if (allSalesError) throw allSalesError;
    const totalRealizedPnLUsd = (allSales || []).reduce(
      (sum, row) => sum + (Number(row.realized_pnl_usd) || 0),
      0
    );
    const totalRealizedPnLArsBlue = toArs(totalRealizedPnLUsd);

    const byTypeSlices = composeComposition(investments, 'type');
    const byCurrencySlices = composeComposition(investments, 'currency');
    const ranked = rankGainersLosers(investments, 3);
    const snapshots = await this.listPerformanceSnapshots(userId, 40);
    const weeklyChange = totalCurrentValue == null ? null : periodChangeFromSnapshots(snapshots, totalCurrentValue, 7);
    const monthlyChange = totalCurrentValue == null ? null : periodChangeFromSnapshots(snapshots, totalCurrentValue, 30);

    const payload: PortfolioSummaryPayload = {
      fxUnavailable: blueArsPerUsd == null || investments.some(inv => inv.fxUnavailable),
      fxStale,
      fxAsOf,
      totalCurrentValue,
      totalPurchaseValue,
      totalPnL,
      totalPnLPercent,
      blueArsPerUsd,
      blueReference,
      totalCurrentValueArsBlue,
      totalPurchaseValueArsBlue,
      totalPnLArsBlue,
      totalDailyPnLUsd,
      totalDailyPnLPercent,
      totalDailyPnLArsBlue,
      totalRealizedPnLUsd,
      totalRealizedPnLArsBlue,
      byType: byTypeSlices.map((s) => ({ type: s.key, count: s.count, value: s.value, pnl: s.pnl })),
      byCurrency: byCurrencySlices.map((s) => ({ type: s.key, count: s.count, value: s.value, pnl: s.pnl })),
      weeklyChange,
      monthlyChange,
      topGainers: ranked.gainers,
      topLosers: ranked.losers,
      investments,
    };

    if (!options?.skipDailySnapshot && !payload.fxUnavailable && !payload.fxStale) {
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
