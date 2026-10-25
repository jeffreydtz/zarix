import { randomUUID } from 'node:crypto';
import { transactionRequestHash, validTransactionRequestId } from '@/lib/transaction-idempotency';
import { nextFinancialRequestId } from '@/lib/financial-request-context';
import { createServiceClientSync } from '@/lib/supabase/server';
import { ApiError } from '@/lib/api-handler';
import { cotizacionesService } from './cotizaciones';
import { blueFxReference, uniqueBlueFxReferences, type BlueFxReference } from '@/lib/blue-fx-reference';
import type { Account } from '@/types/database';

/** Moneda de cuenta normalizada (trim + mayúsculas) para claves de tasas. */
function normalizeAccountCurrency(currency: string | null | undefined): string {
  return (currency?.trim() || 'ARS').toUpperCase();
}

function normalizeOptionalCurrency(currency: unknown): string | null {
  if (currency == null || currency === '') return null;
  const value = String(currency).trim().toUpperCase();
  return value || null;
}

/**
 * El modal de edición siempre manda currency / is_multicurrency / secondary_currency
 * aunque no hayan cambiado. Solo hay que bloquear un cambio real de esos campos
 * cuando la cuenta ya tiene movimientos.
 */
export function patchChangesLockedCurrencySettings(
  current: Pick<Account, 'currency' | 'is_multicurrency' | 'secondary_currency'>,
  patch: Record<string, unknown>
): boolean {
  if (patch.currency !== undefined) {
    const next = normalizeAccountCurrency(String(patch.currency));
    const prev = normalizeAccountCurrency(current.currency);
    if (next !== prev) return true;
  }
  if (patch.is_multicurrency !== undefined) {
    if (Boolean(patch.is_multicurrency) !== Boolean(current.is_multicurrency)) return true;
  }
  if (patch.secondary_currency !== undefined) {
    const next = normalizeOptionalCurrency(patch.secondary_currency);
    const prev = normalizeOptionalCurrency(current.secondary_currency);
    if (next !== prev) return true;
  }
  return false;
}

/**
 * Los triggers de transacciones asumen deuda en negativo (gasto resta, pago a TC suma al saldo).
 * Si la deuda se guarda en positivo, la UI igual muestra "-$X" con abs(), pero un pago INCREMENTA
 * el saldo en BD y parece que sube la deuda.
 */
export function normalizeDebtBalanceForStorage(
  isDebt: boolean,
  accountType: string,
  balance: number
): number {
  const debtAccount = isDebt || accountType === 'credit_card';
  if (!debtAccount) return balance;
  if (balance > 0) {
    return -Math.abs(balance);
  }
  return balance;
}

/** Stablecoins tratadas como ~1 USD si la API devolvió 0 o no hay tasa. */
const STABLECOIN_USD = new Set(['USDT', 'USDC', 'DAI', 'BUSD']);
// Preserve the fiat, crypto and legacy stablecoin currencies already valued here.
const ACCOUNT_CURRENCIES = new Set(['ARS', 'USD', 'EUR', 'BTC', 'ETH', ...STABLECOIN_USD]);

export interface CreateAccountInput {
  userId: string;
  requestId?: string;
  name: string;
  type: string;
  currency: string;
  initialBalance?: number;
  icon?: string;
  color?: string;
  isDebt?: boolean;
  includeInTotal?: boolean;
  /** Si false, no suma al patrimonio líquido. Ignorado en agregados para type investment/crypto. */
  includeInLiquid?: boolean;
  minBalance?: number;
  creditLimit?: number;
  closingDay?: number;
  dueDay?: number;
  last4Digits?: string;
  isMulticurrency?: boolean;
  secondaryCurrency?: string;
}

export interface AccountWithBalance extends Account {
  fxUnavailable?: boolean;
  fxStale?: boolean;
  fxAsOf?: string | null;
  balance_usd?: number | null;
  balance_ars_blue?: number | null;
  multicurrency_balance_primary?: number;
  multicurrency_balance_secondary?: number;
  multicurrency_total_usd?: number | null;
  multicurrency_total_ars_blue?: number | null;
  /** USD/ARS leg only; other currency crosses may use separate references. */
  blueReference?: BlueFxReference;
  /** Read-only exclusion; original balances/currencies are never replaced. */
  valuationIssue?: { reason: 'unsupported_currency' | 'fx_unavailable'; currencies: string[] };
}

export interface PartialAccountValuation {
  status: 'partial';
  excludedAccounts: Array<{
    accountId: string;
    name: string;
    currency: string;
    balance: number;
    secondaryCurrency?: string;
    secondaryBalance?: number;
    reason: 'unsupported_currency' | 'fx_unavailable';
    currencies: string[];
  }>;
}

export interface CreditCardDebtSlice {
  accountId: string;
  name: string;
  last4: string | null;
  isMulticurrency: boolean;
  primaryCurrency: string;
  primaryBalance: number;
  secondaryCurrency: string | null;
  secondaryBalance: number | null;
  usd: number;
  arsBlue: number;
}

/** Totales derivados de `list()` — misma cotización que cada fila. */
export interface AccountAggregates {
  fxUnavailable?: boolean;
  fxStale?: boolean;
  fxAsOf?: string | null;
  /** Efectivo + bancos + billeteras (y other con include_in_liquid), sin tarjetas ni broker. */
  availableUSD: number;
  availableARSBlue: number;
  /** Deuda de tarjetas como magnitud positiva (ARS/USD ya convertidos a USD / ARS blue). */
  creditCardDebtUSD: number;
  creditCardDebtARSBlue: number;
  creditCards: CreditCardDebtSlice[];
  /** Disponible + saldos firmados de tarjetas (negativo si hay deuda). No incluye inversiones. */
  liquidUSD: number;
  liquidARSBlue: number;
  /** Cash de cuentas investment/crypto (no posiciones). No entra al patrimonio líquido. */
  investmentsUSD: number;
  investmentsARSBlue: number;
  /** Igual a liquidUSD: el dashboard nunca suma broker ni posiciones. */
  totalUSD: number;
  totalARSBlue: number;
  totalCreditUsed: number;
  totalCreditLimit: number;
  creditUtilization: number;
  blueReferences?: BlueFxReference[];
  /** When present, numeric totals contain only fully valued included accounts. */
  valuation?: PartialAccountValuation;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

class AccountsService {
  private async computeMulticurrencyBalances(
    userId: string,
    accounts: Account[]
  ): Promise<Map<string, { primary: number; secondary: number }>> {
    const supabase = createServiceClientSync();
    const multi = accounts.filter((a) => a.is_multicurrency && Boolean(a.secondary_currency));
    const out = new Map<string, { primary: number; secondary: number }>();
    if (multi.length === 0) return out;

    const { data: rows, error } = await supabase.rpc('get_multicurrency_balances', {
      p_user_id: userId,
      p_account_ids: multi.map((a) => a.id),
    });

    if (error) throw error;

    for (const row of rows || []) {
      out.set(String(row.account_id), {
        primary: Number(row.primary_balance ?? 0),
        secondary: Number(row.secondary_balance ?? 0),
      });
    }

    return out;
  }

  private getRateToUsd(usdRates: Record<string, number>, currency: string | null | undefined): number | null {
    const c = normalizeAccountCurrency(currency);
    const r = usdRates[c];
    if (r !== undefined && r > 0) return r;
    if (c === 'USD') return 1;
    if (STABLECOIN_USD.has(c)) return 1;
    return null;
  }

  private async buildUsdRates(currencies: string[], blueRate: number | null): Promise<Record<string, number>> {
    const uniqueCurrencies = Array.from(new Set(currencies.map((c) => normalizeAccountCurrency(c))));
    const rates: Record<string, number> = {
      USD: 1,
      ...(blueRate != null && blueRate > 0 ? { ARS: 1 / blueRate } : {}),
    };

    const dynamicCurrencies = uniqueCurrencies.filter((c) => c !== 'USD' && c !== 'ARS');
    const dynamicRates = await Promise.all(
      dynamicCurrencies.map(async (currency) => {
        try {
          const rate = await cotizacionesService.getExchangeRate(currency, 'USD');
          if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid exchange rate');
          return [currency, rate] as const;
        } catch {
          if (STABLECOIN_USD.has(currency)) return [currency, 1] as const;
          if (!ACCOUNT_CURRENCIES.has(currency)) throw new Error(`Cotización ${currency}/USD no disponible`);
          return [currency, null] as const;
        }
      })
    );

    for (const [currency, rate] of dynamicRates) {
      if (rate == null) continue;
      let effective = rate;
      if ((!effective || effective <= 0) && STABLECOIN_USD.has(currency)) {
        effective = 1;
      }
      rates[currency] = effective;
    }

    return rates;
  }

  async create(input: CreateAccountInput): Promise<Account> {
    const supabase = createServiceClientSync();

    if (typeof input.name !== 'string' || !input.name.trim()) {
      throw new ApiError('El nombre de la cuenta es obligatorio.');
    }

    // Moneda normalizada a mayúsculas (CHECK accounts_currency_upper).
    input = {
      ...input,
      currency: (input.currency || 'ARS').trim().toUpperCase(),
      secondaryCurrency: input.secondaryCurrency
        ? input.secondaryCurrency.trim().toUpperCase()
        : input.secondaryCurrency,
    };

    if (!ACCOUNT_CURRENCIES.has(input.currency)) {
      throw new ApiError('La moneda de la cuenta no está soportada.');
    }
    // Match the existing SQL day/digit constraints before optional values become null.
    for (const day of [input.closingDay, input.dueDay]) {
      if (day != null && (!Number.isInteger(Number(day)) || Number(day) < 1 || Number(day) > 31)) {
        throw new ApiError('El día de cierre o vencimiento debe estar entre 1 y 31.');
      }
    }
    if (input.last4Digits && String(input.last4Digits).length !== 4) {
      throw new ApiError('Los últimos dígitos de la tarjeta deben tener cuatro caracteres.');
    }

    const initial = Number(input.initialBalance ?? 0);
    const balanceStored = normalizeDebtBalanceForStorage(
      Boolean(input.isDebt),
      String(input.type),
      initial
    );

    if (!Number.isFinite(balanceStored)) throw new ApiError('El saldo inicial debe ser finito.');
    const requestId = input.requestId ?? nextFinancialRequestId() ?? randomUUID();
    if (!validTransactionRequestId(requestId)) {
      throw new ApiError('Identificador de solicitud inválido.');
    }
    const values = {
      name: input.name, type: input.type, currency: input.currency,
      icon: input.icon || null, color: input.color || '#3B82F6', is_debt: input.isDebt || false,
      include_in_total: input.includeInTotal ?? true, include_in_liquid: input.includeInLiquid ?? true,
      min_balance: input.minBalance || null, credit_limit: input.creditLimit || null,
      closing_day: input.closingDay || null, due_day: input.dueDay || null,
      last_4_digits: input.last4Digits || null, is_multicurrency: input.isMulticurrency || false,
      secondary_currency: input.secondaryCurrency || null,
    };
    const { data, error } = await supabase.rpc('create_account_with_opening_balance', {
      p_user_id: input.userId,
      p_request_id: requestId,
      p_request_hash: transactionRequestHash({ account: values, initialBalance: balanceStored }),
      p_account: values,
      p_initial_balance: balanceStored,
    });
    if (error) throw error;
    return data as Account;
  }

  /**
   * Lista cuentas activas del usuario, incluyendo tipo `investment` (brokers, etc.) por defecto.
   * Pasá `includeInvestments: false` solo si necesitás ocultar esas cuentas.
   */
  async list(userId: string, options?: { includeInvestments?: boolean; allowPartialValuation?: boolean }): Promise<AccountWithBalance[]> {
    const supabase = createServiceClientSync();

    let query = supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (options?.includeInvestments === false) {
      query = query.neq('type', 'investment');
    }

    const { data: accounts, error } = await query.order('sort_order', { ascending: true });

    if (error) throw error;

    // FX is optional for reads: failures must never hide native account data.
    const dolar = await cotizacionesService.getDolarQuotes({ require: ['blue'] }).catch(() => null);
    const blue = dolar?.blue;
    const blueRate = blue && Number.isFinite(blue.sell) && blue.sell > 0 ? blue.sell : null;
    const reference = blue && blueRate != null ? blueFxReference(blue) : undefined;

    const [usdRates, multicurrencyBalances] = await Promise.all([
      this.buildUsdRates(
        accounts.flatMap((a) => [a.currency, a.secondary_currency || ''])
          .filter(currency => !options?.allowPartialValuation || ACCOUNT_CURRENCIES.has(normalizeAccountCurrency(currency))),
        blueRate
      ),
      this.computeMulticurrencyBalances(userId, accounts as Account[]),
    ]);

    const accountsWithConversion = accounts.map((account) => {
      const balance = Number(account.balance);
      const multi = multicurrencyBalances.get(account.id);
      const unsupported = [account.currency,
        ...(account.is_multicurrency && account.secondary_currency ? [account.secondary_currency] : []),
      ].map(normalizeAccountCurrency).filter(currency => !ACCOUNT_CURRENCIES.has(currency));
      if (options?.allowPartialValuation && unsupported.length > 0) {
        // Exclude the whole account if either currency cannot be valued. Do not
        // silently treat a secondary debt as zero or request arbitrary FX pairs.
        return {
          ...account,
          balance,
          multicurrency_balance_primary: multi?.primary,
          multicurrency_balance_secondary: multi?.secondary,
          valuationIssue: { reason: 'unsupported_currency' as const, currencies: [...new Set(unsupported)] },
        };
      }
      const rateToUSD = this.getRateToUsd(usdRates, account.currency);
      const secondaryRateToUSD = this.getRateToUsd(usdRates, account.secondary_currency);
      const isMulti = account.type === 'credit_card' && account.is_multicurrency;
      const unavailable = blueRate == null || rateToUSD == null || (isMulti && secondaryRateToUSD == null);
      let balanceUSD: number | null = null;
      let balanceARSBlue: number | null = null;
      if (!unavailable && rateToUSD != null && blueRate != null) {
        balanceUSD = balance * rateToUSD;
        if (isMulti && multi && secondaryRateToUSD != null) {
          balanceUSD = Number(multi.primary) * rateToUSD + Number(multi.secondary) * secondaryRateToUSD;
        }
        balanceARSBlue = balanceUSD * blueRate;
      }

      return {
        ...account,
        balance,
        fxUnavailable: unavailable,
        fxStale: Boolean(blue?.stale),
        fxAsOf: reference?.observedAt ?? null,
        ...(unavailable ? { valuationIssue: {
          reason: 'fx_unavailable' as const,
          currencies: [normalizeAccountCurrency(account.currency)],
        } } : {}),
        balance_usd: balanceUSD,
        balance_ars_blue: balanceARSBlue,
        blueReference: reference,
        multicurrency_balance_primary: multi?.primary,
        multicurrency_balance_secondary: multi?.secondary,
        multicurrency_total_usd:
          account.type === 'credit_card' && account.is_multicurrency ? balanceUSD : undefined,
        multicurrency_total_ars_blue:
          account.type === 'credit_card' && account.is_multicurrency ? balanceARSBlue : undefined,
      };
    });

    return accountsWithConversion;
  }

  /**
   * Agregados para el dashboard. `include_in_total === false` excluye el SALDO de
   * esa cuenta; las filas de `public.investments` nunca entran acá (van al
   * dashboard de inversiones, sin mirar ese flag).
   *
   * Patrimonio líquido = cash/bank/digital_wallet/other(líquido) + saldos
   * firmados de tarjetas. Cuentas `investment` y `crypto` son cash de broker y
   * no suman al total. Un total negativo se deja negativo.
   */
  aggregateAccountTotals(accounts: AccountWithBalance[]): AccountAggregates {
    const excludedAccounts: PartialAccountValuation['excludedAccounts'] = [];
    let availableUSD = 0;
    let availableARSBlue = 0;
    let liquidUSD = 0;
    let liquidARSBlue = 0;
    let investmentsUSD = 0;
    let investmentsARSBlue = 0;
    let totalCreditUsed = 0;
    let totalCreditLimit = 0;
    const creditCards: CreditCardDebtSlice[] = [];

    for (const a of accounts) {
      if (a.include_in_total === false) continue;
      if (a.valuationIssue) {
        excludedAccounts.push({
          accountId: a.id, name: a.name, currency: a.currency,
          balance: Number(a.type === 'credit_card' && a.is_multicurrency
            ? a.multicurrency_balance_primary ?? a.balance : a.balance),
          ...(a.is_multicurrency && a.secondary_currency ? {
            secondaryCurrency: a.secondary_currency,
            secondaryBalance: a.multicurrency_balance_secondary,
          } : {}),
          ...a.valuationIssue,
        });
        continue;
      }

      const usd = a.balance_usd ?? 0;
      const ars = a.balance_ars_blue ?? 0;

      if (a.type === 'credit_card') {
        const creditUsed = a.is_multicurrency
          ? Math.abs(
              Number(
                a.multicurrency_total_ars_blue ??
                  a.balance_ars_blue ??
                  a.multicurrency_balance_primary ??
                  a.balance
              )
            )
          : Math.abs(Number(a.balance));
        totalCreditUsed += creditUsed;
        totalCreditLimit += Number(a.credit_limit || 0);
        creditCards.push({
          accountId: a.id,
          name: a.name,
          last4: a.last_4_digits,
          isMulticurrency: Boolean(a.is_multicurrency),
          primaryCurrency: (a.currency || 'ARS').toUpperCase(),
          primaryBalance: Number(
            a.is_multicurrency ? a.multicurrency_balance_primary ?? a.balance : a.balance
          ),
          secondaryCurrency: a.is_multicurrency && a.secondary_currency
            ? a.secondary_currency.toUpperCase()
            : null,
          secondaryBalance: a.is_multicurrency
            ? Number(a.multicurrency_balance_secondary ?? 0)
            : null,
          usd,
          arsBlue: ars,
        });
        liquidUSD += usd;
        liquidARSBlue += ars;
        continue;
      }

      if (a.type === 'investment' || a.type === 'crypto') {
        investmentsUSD += usd;
        investmentsARSBlue += ars;
        continue;
      }

      if (a.include_in_liquid !== false) {
        availableUSD += usd;
        availableARSBlue += ars;
        liquidUSD += usd;
        liquidARSBlue += ars;
      }
    }

    const creditCardDebtUSD = Math.max(0, -liquidUSD + availableUSD);
    const creditCardDebtARSBlue = Math.max(0, -liquidARSBlue + availableARSBlue);

    return {
      fxUnavailable: accounts.some(account => account.include_in_total !== false && account.fxUnavailable),
      fxStale: accounts.some(account => account.include_in_total !== false && account.fxStale),
      fxAsOf: accounts.filter(account => account.include_in_total !== false && account.fxStale)
        .map(account => account.fxAsOf).filter((value): value is string => Boolean(value)).sort()[0] ?? null,
      ...(excludedAccounts.length ? { valuation: { status: 'partial' as const, excludedAccounts } } : {}),
      blueReferences: uniqueBlueFxReferences(accounts.filter(account => account.include_in_total !== false)
        .map(account => account.blueReference)),
      availableUSD: roundMoney(availableUSD),
      availableARSBlue: roundMoney(availableARSBlue),
      creditCardDebtUSD: roundMoney(creditCardDebtUSD),
      creditCardDebtARSBlue: roundMoney(creditCardDebtARSBlue),
      creditCards,
      liquidUSD: roundMoney(liquidUSD),
      liquidARSBlue: roundMoney(liquidARSBlue),
      investmentsUSD: roundMoney(investmentsUSD),
      investmentsARSBlue: roundMoney(investmentsARSBlue),
      totalUSD: roundMoney(liquidUSD),
      totalARSBlue: roundMoney(liquidARSBlue),
      totalCreditUsed: roundMoney(totalCreditUsed),
      totalCreditLimit: roundMoney(totalCreditLimit),
      creditUtilization:
        totalCreditLimit > 0
          ? roundMoney((totalCreditUsed / totalCreditLimit) * 100)
          : 0,
    };
  }

  /**
   * IDs de cuentas activas (sin cotizaciones; para filtros de visibilidad de transacciones).
   */
  async getActiveAccountIds(userId: string): Promise<string[]> {
    const supabase = createServiceClientSync();
    const { data, error } = await supabase
      .from('accounts')
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw error;
    return (data ?? []).map((r) => r.id);
  }

  /**
   * Lista liviana de cuentas de inversión para formularios/pantalla de inversiones.
   */
  async listInvestmentAccounts(userId: string): Promise<Account[]> {
    const supabase = createServiceClientSync();
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .in('type', ['investment', 'crypto'])
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return (data ?? []).map((a) => ({ ...a, balance: Number(a.balance) }));
  }

  async listReferenceAccounts(
    userId: string
  ): Promise<Array<Pick<Account, 'id' | 'name' | 'currency' | 'balance' | 'type' | 'last_4_digits'>>> {
    const accounts = await this.list(userId);
    return accounts.map((a) => {
      const balance =
        a.type === 'credit_card' && a.is_multicurrency
          ? Number(a.multicurrency_balance_primary ?? a.balance)
          : Number(a.balance);
      return {
        id: a.id,
        name: a.name,
        currency: a.currency,
        balance,
        type: a.type,
        last_4_digits: a.last_4_digits,
      };
    });
  }

  /**
   * Cuentas archivadas (`is_active: false`) para restaurar o referencia.
   */
  async listArchived(userId: string): Promise<Account[]> {
    const supabase = createServiceClientSync();
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', false)
      .order('sort_order', { ascending: true });

    if (error) throw error;
    return (data ?? []).map((a) => ({ ...a, balance: Number(a.balance) }));
  }

  async getMulticurrencyBreakdown(
    userId: string,
    accountId: string
  ): Promise<{ primary: number; secondary: number; secondaryCurrency: string }> {
    const supabase = createServiceClientSync();
    const { data: acc, error: accErr } = await supabase
      .from('accounts')
      .select('currency,secondary_currency,is_multicurrency,type')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accErr || !acc) {
      throw new Error('Cuenta no encontrada');
    }
    if (!(acc.type === 'credit_card' && acc.is_multicurrency && acc.secondary_currency)) {
      throw new Error('La cuenta no es tarjeta bimoneda');
    }

    const primary = normalizeAccountCurrency(acc.currency);
    const secondary = normalizeAccountCurrency(acc.secondary_currency);
    const { data: rows, error: rpcErr } = await supabase.rpc('get_multicurrency_balances', {
      p_user_id: userId,
      p_account_ids: [accountId],
    });
    if (rpcErr) throw rpcErr;

    const row = (rows || [])[0] as
      | { primary_balance?: number | string | null; secondary_balance?: number | string | null }
      | undefined;

    return {
      primary: Number(row?.primary_balance ?? 0),
      secondary: Number(row?.secondary_balance ?? 0),
      secondaryCurrency: secondary,
    };
  }

  async createSecondaryBalanceAdjustment(
    userId: string,
    accountId: string,
    targetSecondaryBalance: number
  ): Promise<void> {
    const supabase = createServiceClientSync();
    const { data: acc, error: accErr } = await supabase
      .from('accounts')
      .select('currency,secondary_currency,is_multicurrency,type')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accErr || !acc) {
      throw new Error('Cuenta no encontrada');
    }
    if (!(acc.type === 'credit_card' && acc.is_multicurrency && acc.secondary_currency)) {
      throw new Error('La cuenta no es tarjeta bimoneda');
    }

    const target = Number(targetSecondaryBalance);
    if (!Number.isFinite(target)) {
      throw new Error('Saldo secundario inválido');
    }

    const { error } = await supabase.rpc('create_secondary_balance_adjustment', {
      p_user_id: userId,
      p_account_id: accountId,
      p_target_secondary: target,
    });
    if (!error) return;
    const code = (error as { code?: string }).code;
    const msg = (error as { message?: string }).message || '';
    if (code !== 'PGRST202' && !msg.includes('Could not find the function')) {
      if (msg.includes('Cuenta no encontrada') || msg.includes('no es tarjeta')) {
        throw new Error(msg.includes('no es tarjeta') ? 'La cuenta no es tarjeta bimoneda' : 'Cuenta no encontrada');
      }
      throw error;
    }

    const breakdown = await this.getMulticurrencyBreakdown(userId, accountId);
    const deltaSecondary = target - Number(breakdown.secondary);
    if (Math.abs(deltaSecondary) < 1e-8) return;
    const { error: insErr } = await supabase.from('transactions').insert({
      user_id: userId,
      type: 'adjustment',
      account_id: accountId,
      amount: Math.abs(deltaSecondary),
      currency: breakdown.secondaryCurrency,
      amount_in_account_currency: deltaSecondary,
      description: 'Ajuste de saldo moneda secundaria (edición de cuenta)',
      transaction_date: new Date().toISOString(),
    });
    if (insErr) throw insErr;
  }

  async getById(
    id: string,
    userId: string,
    options?: { includeInactive?: boolean }
  ): Promise<Account | null> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) {
      if ((error as { code?: string }).code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    if (!data) return null;
    if (!options?.includeInactive && !data.is_active) {
      return null;
    }

    return { ...data, balance: Number(data.balance) };
  }

  /**
   * Si el saldo de una cuenta de deuda quedó en positivo (misma cifra en pantalla que si fuera negativo),
   * lo pasa a negativo para que pagos y gastos cuadren con los triggers.
   */
  async correctDebtBalanceSignIfPositive(
    accountId: string,
    userId: string
  ): Promise<{ before: number; after: number } | null> {
    const supabase = createServiceClientSync();

    const { data: acc, error } = await supabase
      .from('accounts')
      .select('balance, is_debt, type')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (error || !acc) {
      throw new Error('Cuenta no encontrada');
    }

    const before = Number(acc.balance);
    const debtLike = acc.is_debt || acc.type === 'credit_card';
    if (!debtLike || before <= 0) {
      return null;
    }
    // En tarjeta, un saldo positivo es un crédito (pago de más), no un signo mal cargado.
    if (acc.type === 'credit_card') {
      return null;
    }

    const after = -Math.abs(before);
    const { error: uErr } = await supabase
      .from('accounts')
      .update({ balance: after })
      .eq('id', accountId)
      .eq('user_id', userId);

    if (uErr) throw uErr;
    return { before, after };
  }

  private static readonly ACCOUNT_PATCH_COLUMNS = new Set([
    'name',
    'type',
    'currency',
    'icon',
    'color',
    'is_debt',
    'include_in_total',
    'include_in_liquid',
    'min_balance',
    'credit_limit',
    'closing_day',
    'due_day',
    'last_4_digits',
    'is_multicurrency',
    'secondary_currency',
    'sort_order',
    'is_active',
  ]);

  private static readonly ACCOUNT_PATCH_CAMEL_TO_SNAKE: Record<string, string> = {
    isDebt: 'is_debt',
    includeInTotal: 'include_in_total',
    includeInLiquid: 'include_in_liquid',
    minBalance: 'min_balance',
    creditLimit: 'credit_limit',
    closingDay: 'closing_day',
    dueDay: 'due_day',
    last4Digits: 'last_4_digits',
    isMulticurrency: 'is_multicurrency',
    secondaryCurrency: 'secondary_currency',
  };

  /** Solo columnas permitidas; acepta camelCase o snake_case. */
  sanitizeAccountPatch(body: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value === undefined) continue;
      const col =
        AccountsService.ACCOUNT_PATCH_CAMEL_TO_SNAKE[key] ??
        (AccountsService.ACCOUNT_PATCH_COLUMNS.has(key) ? key : null);
      if (!col) continue;
      // Moneda normalizada a mayúsculas (CHECK accounts_currency_upper /
      // accounts_secondary_currency_upper).
      if ((col === 'currency' || col === 'secondary_currency') && typeof value === 'string') {
        out[col] = value.trim().toUpperCase();
      } else {
        out[col] = value;
      }
    }
    return out;
  }

  async update(id: string, userId: string, updates: Record<string, unknown>): Promise<Account> {
    const supabase = createServiceClientSync();
    const row = this.sanitizeAccountPatch(updates);
    if (Object.keys(row).length === 0) {
      throw new ApiError('No hay cambios válidos', 400);
    }

    const current = await this.getById(id, userId, { includeInactive: true });
    if (!current) {
      throw new ApiError('Cuenta no encontrada', 404);
    }

    if (patchChangesLockedCurrencySettings(current, row)) {
      const { count, error: countErr } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .or(`account_id.eq.${id},destination_account_id.eq.${id}`);
      if (countErr) throw countErr;
      if ((count ?? 0) > 0) {
        throw new ApiError(
          'No se puede cambiar la moneda ni el modo bimoneda de una cuenta con movimientos.',
          400
        );
      }
    }

    const { data, error } = await supabase
      .from('accounts')
      .update(row as any)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Archiva la cuenta (`is_active: false`). No borra filas ni transacciones;
   * los movimientos dejan de mostrarse en listados globales mientras la cuenta siga archivada.
   */
  async delete(id: string, userId: string): Promise<void> {
    const supabase = createServiceClientSync();

    const { error } = await supabase
      .from('accounts')
      .update({ is_active: false })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async getTotalBalance(userId: string) {
    const accounts = await this.list(userId);
    const nonInvestment = accounts.filter((a) => a.type !== 'investment');
    const agg = this.aggregateAccountTotals(accounts);

    return {
      fxUnavailable: agg.fxUnavailable,
      fxStale: agg.fxStale,
      fxAsOf: agg.fxAsOf,
      totalUSD: agg.fxUnavailable ? null : agg.liquidUSD,
      totalARSBlue: agg.fxUnavailable ? null : agg.liquidARSBlue,
      accountCount: nonInvestment.length,
      totalCreditUsed: agg.totalCreditUsed,
      totalCreditLimit: agg.totalCreditLimit,
      creditUtilization: agg.creditUtilization,
    };
  }

  async getTotalBalanceWithInvestments(userId: string) {
    const accounts = await this.list(userId);
    const agg = this.aggregateAccountTotals(accounts);

    return {
      fxUnavailable: agg.fxUnavailable,
      fxStale: agg.fxStale,
      fxAsOf: agg.fxAsOf,
      liquidUSD: agg.fxUnavailable ? null : agg.liquidUSD,
      liquidARSBlue: agg.fxUnavailable ? null : agg.liquidARSBlue,
      investmentsUSD: agg.fxUnavailable ? null : agg.investmentsUSD,
      investmentsARSBlue: agg.fxUnavailable ? null : agg.investmentsARSBlue,
      totalUSD: agg.fxUnavailable ? null : agg.totalUSD,
      totalARSBlue: agg.fxUnavailable ? null : agg.totalARSBlue,
    };
  }

  async findByName(userId: string, name: string): Promise<Account | null> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .ilike('name', `%${name}%`)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (error || !data) return null;
    return { ...data, balance: Number(data.balance) };
  }

  async findByNameFuzzy(userId: string, searchName: string, options?: {
    /** Moneda del movimiento (ej. 'ARS'): desempata entre cuentas homónimas si el nombre no trae moneda. */
    currency?: string;
  }): Promise<{
    account: Account | null;
    confidence: 'exact' | 'high' | 'medium' | 'low' | 'none';
    suggestions?: Account[];
  }> {
    const supabase = createServiceClientSync();

    const { data: accounts, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error || !accounts || accounts.length === 0) {
      return { account: null, confidence: 'none' };
    }

    const normalizedSearch = this.normalizeAccountName(searchName);

    // La moneda dicha dentro del nombre ("naranja x usd") pesa más que la del movimiento.
    const currencyHint =
      this.extractCurrencyHint(searchName) ??
      (options?.currency ? options.currency.trim().toUpperCase() : null);

    const scored = accounts.map(acc => {
      const normalizedName = this.normalizeAccountName(acc.name);
      const score = this.calculateSimilarity(normalizedSearch, normalizedName);
      const currencyMatch = currencyHint ? this.accountSupportsCurrency(acc, currencyHint) : true;
      return { account: { ...acc, balance: Number(acc.balance) }, score, currencyMatch };
    });

    scored.sort((a, b) => b.score - a.score);

    // "Naranja X ARS" y "Naranja X USD" normalizan idéntico y empatan en score:
    // entre los casi-empatados con el mejor, preferimos la cuenta cuya moneda coincide.
    const TIE_MARGIN = 0.05;
    const best =
      scored.find(s => s.currencyMatch && s.score >= scored[0].score - TIE_MARGIN) ?? scored[0];

    if (best.score >= 0.9) {
      return { account: best.account, confidence: 'exact' };
    }

    if (best.score >= 0.6) {
      return { account: best.account, confidence: 'high' };
    }

    if (best.score >= 0.4) {
      return { account: best.account, confidence: 'medium' };
    }

    if (best.score >= 0.25) {
      const suggestions = scored.filter(s => s.score >= 0.2).slice(0, 3).map(s => s.account);
      return { account: null, confidence: 'low', suggestions };
    }

    return { account: null, confidence: 'none' };
  }

  /** Detecta una moneda mencionada dentro del texto ("naranja x usd" → 'USD'). */
  private extractCurrencyHint(name: string): string | null {
    const tokens = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .split(/[^a-z]+/);
    if (tokens.some(t => ['usd', 'dolar', 'dolares', 'dollar', 'dollars'].includes(t))) return 'USD';
    if (tokens.some(t => ['ars', 'peso', 'pesos'].includes(t))) return 'ARS';
    return null;
  }

  private accountSupportsCurrency(
    account: { currency?: string | null; is_multicurrency?: boolean | null; secondary_currency?: string | null },
    currency: string
  ): boolean {
    return (
      account.currency === currency ||
      Boolean(account.is_multicurrency && account.secondary_currency === currency)
    );
  }

  private normalizeAccountName(name: string): string {
    const synonyms: Record<string, string[]> = {
      'efectivo': ['cash', 'plata', 'billetera', 'bolsillo'],
      'banco': ['bank', 'cuenta bancaria', 'caja de ahorro', 'cuenta corriente'],
      'tarjeta': ['card', 'visa', 'mastercard', 'amex', 'credito', 'debito'],
      'mercadopago': ['mp', 'mercado pago', 'meli'],
      'brubank': ['bru', 'brubank'],
      'uala': ['ualá'],
      'galicia': ['galicia', 'banco galicia'],
      'santander': ['santander', 'rio'],
      'bbva': ['bbva', 'frances'],
      'macro': ['macro', 'banco macro'],
      'cripto': ['crypto', 'bitcoin', 'btc', 'eth', 'usdt'],
    };

    let normalized = name.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .trim();

    for (const [canonical, variants] of Object.entries(synonyms)) {
      for (const variant of variants) {
        if (normalized.includes(variant)) {
          normalized = normalized.replace(variant, canonical);
        }
      }
    }

    const stopWords = ['de', 'la', 'el', 'los', 'las', 'mi', 'mis', 'cuenta', 'pesos', 'dolares', 'ars', 'usd'];
    normalized = normalized.split(' ').filter(w => !stopWords.includes(w)).join(' ');

    return normalized.trim();
  }

  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;

    if (str1.includes(str2) || str2.includes(str1)) {
      return 0.85;
    }

    const words1 = str1.split(' ').filter(w => w.length > 0);
    const words2 = str2.split(' ').filter(w => w.length > 0);

    let wordMatches = 0;
    for (const w1 of words1) {
      for (const w2 of words2) {
        if (w1 === w2 || w1.includes(w2) || w2.includes(w1)) {
          wordMatches++;
          break;
        }
      }
    }

    const wordScore = wordMatches / Math.max(words1.length, words2.length);

    const maxLen = Math.max(str1.length, str2.length);
    const distance = this.levenshteinDistance(str1, str2);
    const levenScore = 1 - (distance / maxLen);

    return Math.max(wordScore * 0.6 + levenScore * 0.4, wordScore, levenScore * 0.8);
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const m = str1.length;
    const n = str2.length;

    if (m === 0) return n;
    if (n === 0) return m;

    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost
        );
      }
    }

    return dp[m][n];
  }
}

export const accountsService = new AccountsService();
