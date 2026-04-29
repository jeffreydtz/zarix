import { createServiceClientSync } from '@/lib/supabase/server';
import { cotizacionesService } from './cotizaciones';
import type { Account } from '@/types/database';

/** Moneda de cuenta normalizada (trim + mayúsculas) para claves de tasas. */
function normalizeAccountCurrency(currency: string | null | undefined): string {
  return (currency?.trim() || 'ARS').toUpperCase();
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

export interface CreateAccountInput {
  userId: string;
  name: string;
  type: string;
  currency: string;
  initialBalance?: number;
  icon?: string;
  color?: string;
  isDebt?: boolean;
  includeInTotal?: boolean;
  /** Si false, no suma al patrimonio líquido (sí al total). Ignorado en agregados para type investment. */
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
  balance_usd?: number;
  balance_ars_blue?: number;
  multicurrency_balance_primary?: number;
  multicurrency_balance_secondary?: number;
}

/** Totales derivados de `list()` — misma cotización que cada fila. */
export interface AccountAggregates {
  /** Suma en USD equivalente (no inversión y con `include_in_liquid`). */
  liquidUSD: number;
  liquidARSBlue: number;
  investmentsUSD: number;
  investmentsARSBlue: number;
  totalUSD: number;
  totalARSBlue: number;
  totalCreditUsed: number;
  totalCreditLimit: number;
  creditUtilization: number;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

class AccountsService {
  private postgrestQuotedUuidList(ids: string[]): string {
    return ids.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(',');
  }

  private async computeMulticurrencyBalances(
    userId: string,
    accounts: Account[]
  ): Promise<Map<string, { primary: number; secondary: number }>> {
    const supabase = createServiceClientSync();
    const multi = accounts.filter((a) => a.is_multicurrency && Boolean(a.secondary_currency));
    const out = new Map<string, { primary: number; secondary: number }>();
    if (multi.length === 0) return out;

    const byId = new Map(multi.map((a) => [a.id, a] as const));
    for (const a of multi) out.set(a.id, { primary: 0, secondary: 0 });

    const inList = this.postgrestQuotedUuidList(multi.map((a) => a.id));
    const { data: rows, error } = await supabase
      .from('transactions')
      .select(
        'account_id,destination_account_id,type,amount,currency,amount_in_account_currency,exchange_rate'
      )
      .eq('user_id', userId)
      .or(`account_id.in.(${inList}),destination_account_id.in.(${inList})`);

    if (error) throw error;

    const addSigned = (
      accountId: string,
      txCurrencyRaw: string,
      signedOriginalAmount: number,
      signedPrimaryFallback: number
    ) => {
      const acc = byId.get(accountId);
      const cur = txCurrencyRaw.trim().toUpperCase();
      if (!acc) return;
      const primary = acc.currency.trim().toUpperCase();
      const secondary = (acc.secondary_currency || '').trim().toUpperCase();
      const b = out.get(accountId);
      if (!b) return;

      if (cur === primary) {
        b.primary += signedOriginalAmount;
        return;
      }
      if (cur === secondary) {
        b.secondary += signedOriginalAmount;
        return;
      }
      b.primary += signedPrimaryFallback;
    };

    for (const tx of rows || []) {
      const amount = Number(tx.amount);
      const ain = Number(tx.amount_in_account_currency);
      const rate = Number(tx.exchange_rate ?? 1);
      const sourceId = tx.account_id as string | null;
      const destinationId = tx.destination_account_id as string | null;

      if (sourceId && byId.has(sourceId)) {
        if (tx.type === 'expense') addSigned(sourceId, tx.currency, -amount, -ain);
        if (tx.type === 'income') addSigned(sourceId, tx.currency, amount, ain);
        if (tx.type === 'adjustment') addSigned(sourceId, tx.currency, amount, ain);
        if (tx.type === 'transfer') addSigned(sourceId, tx.currency, -amount, -ain);
      }

      if (destinationId && byId.has(destinationId) && tx.type === 'transfer') {
        const destAcc = byId.get(destinationId)!;
        const txCur = String(tx.currency || '').trim().toUpperCase();
        const primary = destAcc.currency.trim().toUpperCase();
        const secondary = (destAcc.secondary_currency || '').trim().toUpperCase();
        const credited = amount * (Number.isFinite(rate) && rate > 0 ? rate : 1);
        let creditedCurrency = txCur;
        if (txCur === primary && secondary && rate !== 1) creditedCurrency = secondary;
        if (txCur === secondary && rate !== 1) creditedCurrency = primary;
        addSigned(destinationId, creditedCurrency, credited, credited);
      }
    }

    return out;
  }

  private getRateToUsd(usdRates: Record<string, number>, currency: string | null | undefined): number {
    const c = normalizeAccountCurrency(currency);
    const r = usdRates[c];
    if (r !== undefined && r > 0) return r;
    if (c === 'USD') return 1;
    if (STABLECOIN_USD.has(c)) return 1;
    return 0;
  }

  private async buildUsdRates(currencies: string[], blueRate: number): Promise<Record<string, number>> {
    const uniqueCurrencies = Array.from(new Set(currencies.map((c) => normalizeAccountCurrency(c))));
    const rates: Record<string, number> = {
      USD: 1,
      ARS: blueRate > 0 ? 1 / blueRate : 0,
    };

    const dynamicCurrencies = uniqueCurrencies.filter((c) => c !== 'USD' && c !== 'ARS');
    const dynamicRates = await Promise.all(
      dynamicCurrencies.map(async (currency) => {
        try {
          const rate = await cotizacionesService.getExchangeRate(currency, 'USD');
          return [currency, rate] as const;
        } catch {
          return [currency, 0] as const;
        }
      })
    );

    for (const [currency, rate] of dynamicRates) {
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

    const { data: accounts } = await supabase
      .from('accounts')
      .select('sort_order')
      .eq('user_id', input.userId)
      .order('sort_order', { ascending: false })
      .limit(1);

    const nextSortOrder = accounts && accounts.length > 0 ? accounts[0].sort_order + 1 : 0;

    const initial = Number(input.initialBalance ?? 0);
    const balanceStored = normalizeDebtBalanceForStorage(
      Boolean(input.isDebt),
      String(input.type),
      initial
    );

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        user_id: input.userId,
        name: input.name,
        type: input.type as any,
        currency: input.currency,
        balance: balanceStored,
        icon: input.icon || null,
        color: input.color || '#3B82F6',
        is_debt: input.isDebt || false,
        include_in_total: input.includeInTotal !== undefined ? input.includeInTotal : true,
        include_in_liquid: input.includeInLiquid !== undefined ? input.includeInLiquid : true,
        min_balance: input.minBalance || null,
        credit_limit: input.creditLimit || null,
        closing_day: input.closingDay || null,
        due_day: input.dueDay || null,
        last_4_digits: input.last4Digits || null,
        is_multicurrency: input.isMulticurrency || false,
        secondary_currency: input.secondaryCurrency || null,
        sort_order: nextSortOrder,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Lista cuentas activas del usuario, incluyendo tipo `investment` (brokers, etc.) por defecto.
   * Pasá `includeInvestments: false` solo si necesitás ocultar esas cuentas.
   */
  async list(userId: string, options?: { includeInvestments?: boolean }): Promise<AccountWithBalance[]> {
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

    const blueRate = await cotizacionesService.getExchangeRate('USD', 'ARS');

    if (blueRate === 0) {
      throw new Error('Exchange rate not available');
    }

    const usdRates = await this.buildUsdRates(
      accounts.flatMap((a) => [a.currency, a.secondary_currency || '']),
      blueRate
    );
    const multicurrencyBalances = await this.computeMulticurrencyBalances(userId, accounts as Account[]);

    const accountsWithConversion = accounts.map((account) => {
      const balance = Number(account.balance);
      const rateToUSD = this.getRateToUsd(usdRates, account.currency);
      let balanceUSD = 0;
      let balanceARSBlue = 0;
      const multi = multicurrencyBalances.get(account.id);
      if (multi) {
        const ratePrimary = this.getRateToUsd(usdRates, account.currency);
        const rateSecondary = this.getRateToUsd(usdRates, account.secondary_currency);
        if (ratePrimary > 0) balanceUSD += multi.primary * ratePrimary;
        if (rateSecondary > 0) balanceUSD += multi.secondary * rateSecondary;
        balanceARSBlue = balanceUSD * blueRate;
      } else if (rateToUSD > 0) {
        balanceUSD = balance * rateToUSD;
        balanceARSBlue = balanceUSD * blueRate;
      }

      return {
        ...account,
        balance,
        balance_usd: balanceUSD,
        balance_ars_blue: balanceARSBlue,
        multicurrency_balance_primary: multi?.primary,
        multicurrency_balance_secondary: multi?.secondary,
      };
    });

    return accountsWithConversion;
  }

  /**
   * Patrimonio mostrado en el panel: solo cuentas con `include_in_total !== false`
   * (alineado a la vista SQL y a “Incluir en totales” en la app). Esas cuentas siguen
   * activas en la lista; no es lo mismo que archivar (`is_active`).
   *
   * Dentro de ese conjunto:
   * - Liquidez: no `investment` y `include_in_liquid !== false`.
   * - No líquido: no inversión y sin liquidez; suma al total.
   * - Inversiones: `type === 'investment'`.
   */
  aggregateAccountTotals(accounts: AccountWithBalance[]): AccountAggregates {
    let liquidUSD = 0;
    let liquidARSBlue = 0;
    let nonLiquidUSD = 0;
    let nonLiquidARSBlue = 0;
    let investmentsUSD = 0;
    let investmentsARSBlue = 0;
    let totalCreditUsed = 0;
    let totalCreditLimit = 0;

    for (const a of accounts) {
      if (a.include_in_total === false) continue;

      if (a.type === 'credit_card') {
        const cardUsed = a.is_multicurrency && a.multicurrency_balance_primary != null
          ? Math.abs(Number(a.multicurrency_balance_primary)) +
            Math.abs(Number(a.multicurrency_balance_secondary || 0))
          : Math.abs(Number(a.balance));
        totalCreditUsed += cardUsed;
        totalCreditLimit += Number(a.credit_limit || 0);
      }

      const usd = a.balance_usd ?? 0;
      const ars = a.balance_ars_blue ?? 0;

      if (a.type === 'investment') {
        investmentsUSD += usd;
        investmentsARSBlue += ars;
      } else {
        const inLiquid = a.include_in_liquid !== false;
        if (inLiquid) {
          liquidUSD += usd;
          liquidARSBlue += ars;
        } else {
          nonLiquidUSD += usd;
          nonLiquidARSBlue += ars;
        }
      }
    }

    const totalUSD = liquidUSD + nonLiquidUSD + investmentsUSD;
    const totalARSBlue = liquidARSBlue + nonLiquidARSBlue + investmentsARSBlue;

    return {
      liquidUSD: roundMoney(liquidUSD),
      liquidARSBlue: roundMoney(liquidARSBlue),
      investmentsUSD: roundMoney(investmentsUSD),
      investmentsARSBlue: roundMoney(investmentsARSBlue),
      totalUSD: roundMoney(totalUSD),
      totalARSBlue: roundMoney(totalARSBlue),
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
      out[col] = value;
    }
    return out;
  }

  async update(id: string, userId: string, updates: Record<string, unknown>): Promise<Account> {
    const supabase = createServiceClientSync();
    const row = this.sanitizeAccountPatch(updates);
    if (Object.keys(row).length === 0) {
      throw new Error('No hay cambios válidos');
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
      totalUSD: agg.liquidUSD,
      totalARSBlue: agg.liquidARSBlue,
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
      liquidUSD: agg.liquidUSD,
      liquidARSBlue: agg.liquidARSBlue,
      investmentsUSD: agg.investmentsUSD,
      investmentsARSBlue: agg.investmentsARSBlue,
      totalUSD: agg.totalUSD,
      totalARSBlue: agg.totalARSBlue,
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

  async findByNameFuzzy(userId: string, searchName: string): Promise<{
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

    const scored = accounts.map(acc => {
      const normalizedName = this.normalizeAccountName(acc.name);
      const score = this.calculateSimilarity(normalizedSearch, normalizedName);
      return { account: { ...acc, balance: Number(acc.balance) }, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];

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
