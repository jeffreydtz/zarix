import { createServiceClientSync } from '@/lib/supabase/server';
import { cotizacionesService } from './cotizaciones';
import type { Account } from '@/types/database';

/** Moneda de cuenta normalizada (trim + mayúsculas) para claves de tasas. */
function normalizeAccountCurrency(currency: string | null | undefined): string {
  return (currency?.trim() || 'ARS').toUpperCase();
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
}

class AccountsService {
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

    const { data, error } = await supabase
      .from('accounts')
      .insert({
        user_id: input.userId,
        name: input.name,
        type: input.type as any,
        currency: input.currency,
        balance: input.initialBalance || 0,
        icon: input.icon || null,
        color: input.color || '#3B82F6',
        is_debt: input.isDebt || false,
        include_in_total: input.includeInTotal !== undefined ? input.includeInTotal : true,
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
      accounts.map((a) => a.currency),
      blueRate
    );

    const accountsWithConversion = accounts.map((account) => {
      const balance = Number(account.balance);
      const rateToUSD = this.getRateToUsd(usdRates, account.currency);
      let balanceUSD = 0;
      let balanceARSBlue = 0;
      if (rateToUSD > 0) {
        balanceUSD = balance * rateToUSD;
        balanceARSBlue = balanceUSD * blueRate;
      }

      return {
        ...account,
        balance,
        balance_usd: balanceUSD,
        balance_ars_blue: balanceARSBlue,
      };
    });

    return accountsWithConversion;
  }

  async getById(id: string, userId: string): Promise<Account> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return { ...data, balance: Number(data.balance) };
  }

  async update(
    id: string,
    userId: string,
    updates: Partial<CreateAccountInput>
  ): Promise<Account> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('accounts')
      .update(updates as any)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async delete(id: string, userId: string): Promise<void> {
    const supabase = createServiceClientSync();

    const { data: transactions } = await supabase
      .from('transactions')
      .select('id')
      .eq('account_id', id)
      .limit(1);

    if (transactions && transactions.length > 0) {
      throw new Error('Cannot delete account with transactions');
    }

    const { error } = await supabase
      .from('accounts')
      .update({ is_active: false })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  async getTotalBalance(userId: string) {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .neq('type', 'investment');

    if (error) throw error;

    const blueRate = await cotizacionesService.getExchangeRate('USD', 'ARS');
    
    if (blueRate === 0) {
      throw new Error('Exchange rate not available');
    }

    const usdRates = await this.buildUsdRates(
      data.map((a) => a.currency),
      blueRate
    );

    let totalUSD = 0;
    let totalARSBlue = 0;
    let totalCreditUsed = 0;
    let totalCreditLimit = 0;

    for (const account of data) {
      if (!account.include_in_total) continue;

      const balance = Number(account.balance);

      if (account.type === 'credit_card') {
        totalCreditUsed += Math.abs(balance);
        totalCreditLimit += Number(account.credit_limit || 0);
      }

      const rateToUSD = this.getRateToUsd(usdRates, account.currency);
      if (rateToUSD > 0) {
        const balanceUSD = balance * rateToUSD;
        totalUSD += balanceUSD;
        totalARSBlue += balanceUSD * blueRate;
      }
    }

    return {
      totalUSD: Math.round(totalUSD * 100) / 100,
      totalARSBlue: Math.round(totalARSBlue * 100) / 100,
      accountCount: data.length,
      totalCreditUsed: Math.round(totalCreditUsed * 100) / 100,
      totalCreditLimit: Math.round(totalCreditLimit * 100) / 100,
      creditUtilization: totalCreditLimit > 0 ? Math.round((totalCreditUsed / totalCreditLimit) * 100 * 100) / 100 : 0,
    };
  }

  async getTotalBalanceWithInvestments(userId: string) {
    const supabase = createServiceClientSync();

    const { data: allAccounts, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (error) throw error;

    const blueRate = await cotizacionesService.getExchangeRate('USD', 'ARS');
    
    if (blueRate === 0) {
      throw new Error('Exchange rate not available');
    }

    const usdRates = await this.buildUsdRates(
      allAccounts.map((a) => a.currency),
      blueRate
    );

    let liquidUSD = 0;
    let liquidARSBlue = 0;
    let investmentsUSD = 0;
    let investmentsARSBlue = 0;

    for (const account of allAccounts) {
      if (!account.include_in_total) continue;

      const balance = Number(account.balance);
      const isInvestment = account.type === 'investment';

      let balanceUSD = 0;
      let balanceARSBlue = 0;

      const rateToUSD = this.getRateToUsd(usdRates, account.currency);
      if (rateToUSD > 0) {
        balanceUSD = balance * rateToUSD;
        balanceARSBlue = balanceUSD * blueRate;
      }

      if (isInvestment) {
        investmentsUSD += balanceUSD;
        investmentsARSBlue += balanceARSBlue;
      } else {
        liquidUSD += balanceUSD;
        liquidARSBlue += balanceARSBlue;
      }
    }

    return {
      liquidUSD: Math.round(liquidUSD * 100) / 100,
      liquidARSBlue: Math.round(liquidARSBlue * 100) / 100,
      investmentsUSD: Math.round(investmentsUSD * 100) / 100,
      investmentsARSBlue: Math.round(investmentsARSBlue * 100) / 100,
      totalUSD: Math.round((liquidUSD + investmentsUSD) * 100) / 100,
      totalARSBlue: Math.round((liquidARSBlue + investmentsARSBlue) * 100) / 100,
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
