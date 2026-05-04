import { createServiceClientSync } from '@/lib/supabase/server';
import { normalizeCurrency } from '@/lib/transaction-exchange';
import { accountsService, normalizeDebtBalanceForStorage } from './accounts';
import { cotizacionesService } from './cotizaciones';
import type { Transaction, Account } from '@/types/database';

/**
 * PostgREST interpreta guiones en UUID como operadores si van sin comillas en `in.(...)`.
 * El `.in()` del cliente solo añade comillas para `,` y `()`, no para `-`.
 * @see https://postgrest.org/en/stable/references/api/tables_views.html#reserved-characters
 */
function postgrestQuotedUuidList(ids: string[]): string {
  return ids.map((id) => `"${id.replace(/"/g, '\\"')}"`).join(',');
}

function postgrestEqUuid(id: string): string {
  return `"${id.replace(/"/g, '\\"')}"`;
}

/**
 * Listados globales: excluye movimientos que tocan cuentas archivadas.
 * Debe ser **síncrona** y devolver el builder: `PostgrestBuilder` es thenable; si se devuelve
 * desde una función `async`, la promesa lo aplana y ejecuta la query (bug: `n.eq is not a function`).
 *
 * Llamá antes: `const activeIds = await accountsService.getActiveAccountIds(userId);`
 */
export function applyArchivedAccountsTransactionFilter(query: any, activeIds: string[]) {
  if (activeIds.length === 0) {
    return query.eq('id', '00000000-0000-0000-0000-000000000000');
  }
  const inList = postgrestQuotedUuidList(activeIds);
  return query
    .filter('account_id', 'in', `(${inList})`)
    .or(`destination_account_id.is.null,destination_account_id.in.(${inList})`);
}

/** Misma regla que transferencias: cotización de mercado entre moneda del comprobante y moneda de la cuenta. */
async function computeAmountInAccountCurrencyForAccount(
  amount: number,
  currency: string,
  accountCurrency: string
): Promise<{ amountInAccountCurrency: number; exchangeRate: number }> {
  const c = normalizeCurrency(currency);
  const a = normalizeCurrency(accountCurrency);
  if (c === a) {
    return { amountInAccountCurrency: amount, exchangeRate: 1 };
  }
  const exchangeRate = await cotizacionesService.getExchangeRate(currency, accountCurrency);
  return { amountInAccountCurrency: amount * exchangeRate, exchangeRate };
}

export interface CreateTransactionInput {
  userId: string;
  type: 'expense' | 'income' | 'transfer' | 'adjustment';
  accountId: string;
  destinationAccountId?: string;
  amount: number;
  currency: string;
  categoryId?: string;
  description?: string;
  notes?: string;
  tags?: string[];
  transactionDate?: string;
  installments?: number;
  /**
   * Solo transferencias entre monedas distintas: reemplaza la cotización del mercado.
   * - Monto en origen: unidades de moneda destino por 1 unidad de moneda origen (equivale a `getExchangeRate(origen, destino)`).
   * - Monto en destino: unidades de moneda origen por 1 unidad de moneda destino (equivale a `getExchangeRate(destino, origen)`).
   */
  exchangeRateOverride?: number | null;
}

export interface TransactionWithCategory extends Transaction {
  category?: {
    name: string;
    icon: string;
  };
  account?: {
    name: string;
    currency: string;
  };
  destination_account?: {
    name: string;
    currency: string;
  } | null;
}

class TransactionsService {
  async create(input: CreateTransactionInput): Promise<Transaction> {
    const supabase = createServiceClientSync();

    const account = await supabase
      .from('accounts')
      .select('*')
      .eq('id', input.accountId)
      .single();

    if (account.error || !account.data) {
      throw new Error('Account not found');
    }

    const isTransfer = input.type === 'transfer' && Boolean(input.destinationAccountId);

    let exchangeRate = 1;
    let amountInAccountCurrency = input.amount;

    if (!isTransfer) {
      const conv = await computeAmountInAccountCurrencyForAccount(
        input.amount,
        input.currency,
        account.data.currency
      );
      amountInAccountCurrency = conv.amountInAccountCurrency;
      exchangeRate = conv.exchangeRate;
    }

    if (input.installments && input.installments > 1) {
      const { data, error } = await supabase.rpc('create_installment_transactions', {
        p_user_id: input.userId,
        p_account_id: input.accountId,
        p_total_amount: input.amount,
        p_currency: input.currency,
        p_installments: input.installments,
        p_category_id: input.categoryId || null,
        p_description: input.description || 'Compra en cuotas',
        p_start_date: input.transactionDate || new Date().toISOString(),
      });

      if (error) throw error;

      const firstInstallment = await supabase
        .from('transactions')
        .select('*')
        .eq('installment_group_id', data)
        .eq('installment_number', 1)
        .single();

      if (firstInstallment.error) throw firstInstallment.error;
      return firstInstallment.data;
    }

    if (input.type === 'transfer' && input.destinationAccountId) {
      const destAccount = await supabase
        .from('accounts')
        .select('*')
        .eq('id', input.destinationAccountId)
        .single();

      if (destAccount.error || !destAccount.data) {
        throw new Error('Destination account not found');
      }

      const srcCur = account.data.currency.trim().toUpperCase();
      const dstCur = destAccount.data.currency.trim().toUpperCase();
      const inCur = input.currency.trim().toUpperCase();
      if (srcCur !== dstCur && inCur !== srcCur && inCur !== dstCur) {
        throw new Error(
          'En transferencias entre monedas distintas, el monto debe estar en la moneda de la cuenta origen o de la cuenta destino.'
        );
      }

      const override =
        input.exchangeRateOverride != null &&
        Number.isFinite(input.exchangeRateOverride) &&
        input.exchangeRateOverride > 0
          ? input.exchangeRateOverride
          : null;

      let transferAmountInSource: number;
      let transferExchangeRate: number;

      if (srcCur === dstCur) {
        transferAmountInSource = input.amount;
        transferExchangeRate = 1;
      } else if (inCur === srcCur) {
        transferAmountInSource = input.amount;
        transferExchangeRate =
          override ??
          (await cotizacionesService.getExchangeRate(input.currency, destAccount.data.currency));
      } else {
        transferExchangeRate = 1;
        transferAmountInSource =
          input.amount *
          (override ??
            (await cotizacionesService.getExchangeRate(input.currency, account.data.currency)));
      }

      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: input.userId,
          type: 'transfer',
          account_id: input.accountId,
          destination_account_id: input.destinationAccountId,
          amount: input.amount,
          currency: input.currency,
          amount_in_account_currency: transferAmountInSource,
          exchange_rate: transferExchangeRate !== 1 ? transferExchangeRate : null,
          description: input.description || 'Transferencia entre cuentas',
          transaction_date: input.transactionDate || new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        user_id: input.userId,
        type: input.type,
        account_id: input.accountId,
        amount: input.amount,
        currency: input.currency,
        amount_in_account_currency: amountInAccountCurrency,
        exchange_rate: exchangeRate !== 1 ? exchangeRate : null,
        category_id: input.categoryId || null,
        description: input.description || null,
        notes: input.notes || null,
        tags: input.tags || null,
        transaction_date: input.transactionDate || new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async list(
    userId: string,
    options: {
      /** Solo movimientos donde esta cuenta es la principal (origen). */
      accountId?: string;
      /**
       * Movimientos donde la cuenta participa como origen O como destino (útil para ver
       * transferencias entrantes y salientes en la ficha de la cuenta).
       */
      involveAccountId?: string;
      categoryId?: string;
      type?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
      minAmount?: number;
      maxAmount?: number;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<TransactionWithCategory[]> {
    const supabase = createServiceClientSync();

    let query = supabase
      .from('transactions')
      .select(
        `
        *,
        category:categories(name, icon),
        account:accounts!transactions_account_id_fkey(name, currency),
        destination_account:accounts!transactions_destination_account_id_fkey(name, currency)
      `
      )
      .eq('user_id', userId);

    const globalOnly = !options.accountId && !options.involveAccountId;
    if (globalOnly) {
      const activeIds = await accountsService.getActiveAccountIds(userId);
      query = applyArchivedAccountsTransactionFilter(query, activeIds);
    }

    if (options.involveAccountId) {
      const id = postgrestEqUuid(options.involveAccountId);
      query = query.or(`account_id.eq.${id},destination_account_id.eq.${id}`);
    } else if (options.accountId) {
      query = query.eq('account_id', options.accountId);
    }

    if (options.categoryId) {
      if (options.categoryId === 'uncategorized') {
        query = query.is('category_id', null);
      } else {
        query = query.eq('category_id', options.categoryId);
      }
    }

    if (options.type) {
      query = query.eq('type', options.type);
    }

    if (options.startDate) {
      query = query.gte('transaction_date', options.startDate);
    }

    if (options.endDate) {
      // End of the day for the endDate
      query = query.lte('transaction_date', options.endDate + 'T23:59:59');
    }

    if (options.search) {
      query = query.ilike('description', `%${options.search}%`);
    }

    if (options.minAmount !== undefined) {
      query = query.gte('amount', options.minAmount);
    }

    if (options.maxAmount !== undefined) {
      query = query.lte('amount', options.maxAmount);
    }

    query = query
      .order('transaction_date', { ascending: false })
      .order('id', { ascending: false });

    query = query.limit(options.limit || 100);

    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 100) - 1);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data as TransactionWithCategory[];
  }


  async getById(id: string, userId: string): Promise<TransactionWithCategory> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase
      .from('transactions')
      .select(
        `
        *,
        category:categories(name, icon),
        account:accounts!transactions_account_id_fkey(name, currency),
        destination_account:accounts!transactions_destination_account_id_fkey(name, currency)
      `
      )
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    return data as TransactionWithCategory;
  }

  async delete(id: string, userId: string): Promise<void> {
    const supabase = createServiceClientSync();

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
  }

  /**
   * Recalcula el saldo de la cuenta aplicando la misma lógica que el trigger (suma ordenada de movimientos).
   * Útil si hubo inconsistencias (p. ej. borrar un ajuste antes de que el trigger lo revierta).
   */
  async recomputeAccountBalanceFromLedger(
    userId: string,
    accountId: string
  ): Promise<{ before: number; after: number }> {
    const supabase = createServiceClientSync();

    const { data: account, error: accErr } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accErr || !account) {
      throw new Error('Cuenta no encontrada');
    }

    const { data: txs, error: txErr } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .or(`account_id.eq.${accountId},destination_account_id.eq.${accountId}`)
      .order('transaction_date', { ascending: true })
      .order('id', { ascending: true });

    if (txErr) throw txErr;

    let balance = 0;
    for (const tx of txs || []) {
      const aid = tx.account_id;
      const destId = tx.destination_account_id;
      const t = tx.type;

      if (aid === accountId) {
        const isSecondaryAdjustmentOnMulticurrencyCard =
          t === 'adjustment' &&
          account.type === 'credit_card' &&
          Boolean(account.is_multicurrency) &&
          Boolean(account.secondary_currency) &&
          String(tx.currency || '').trim().toUpperCase() ===
            String(account.secondary_currency || '').trim().toUpperCase();

        if (t === 'expense') {
          balance -= Number(tx.amount_in_account_currency);
        } else if (t === 'income') {
          balance += Number(tx.amount_in_account_currency);
        } else if (t === 'adjustment') {
          if (isSecondaryAdjustmentOnMulticurrencyCard) continue;
          balance += Number(tx.amount_in_account_currency);
        } else if (t === 'transfer') {
          balance -= Number(tx.amount_in_account_currency);
        }
      }
      if (destId === accountId && t === 'transfer') {
        const amt = Number(tx.amount);
        const rate = Number(tx.exchange_rate ?? 1);
        balance += amt * rate;
      }
    }

    const normalized = normalizeDebtBalanceForStorage(
      Boolean(account.is_debt),
      String(account.type),
      balance
    );

    const before = Number(account.balance);
    const { error: updErr } = await supabase
      .from('accounts')
      .update({ balance: normalized, updated_at: new Date().toISOString() })
      .eq('id', accountId)
      .eq('user_id', userId);

    if (updErr) throw updErr;
    return { before, after: normalized };
  }

  /**
   * Lleva el saldo de la cuenta a `targetBalance` (moneda de la cuenta) con un movimiento `adjustment`.
   * Respeta el trigger de saldos: amount > 0, delta puede ser negativo en amount_in_account_currency.
   */
  async createBalanceAdjustment(
    userId: string,
    accountId: string,
    targetBalance: number
  ): Promise<void> {
    const supabase = createServiceClientSync();

    const { data: account, error: accErr } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accErr || !account) {
      throw new Error('Cuenta no encontrada');
    }

    const current = Number(account.balance);
    const target = Number(targetBalance);
    if (!Number.isFinite(target)) {
      throw new Error('Saldo inválido');
    }

    const delta = target - current;
    if (Math.abs(delta) < 1e-8) {
      return;
    }

    const { error: insErr } = await supabase.from('transactions').insert({
      user_id: userId,
      type: 'adjustment',
      account_id: accountId,
      amount: Math.abs(delta),
      currency: account.currency,
      amount_in_account_currency: delta,
      description: 'Ajuste de saldo (edición de cuenta)',
      transaction_date: new Date().toISOString(),
    });

    if (insErr) throw insErr;
  }

  async getMonthSummary(userId: string, month: Date) {
    const supabase = createServiceClientSync();

    const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*, category:categories(name, icon)')
      .eq('user_id', userId)
      .gte('transaction_date', startOfMonth.toISOString())
      .lte('transaction_date', endOfMonth.toISOString());

    if (error) throw error;

    const expenses = transactions.filter((t) => t.type === 'expense');
    const income = transactions.filter((t) => t.type === 'income');

    const totalExpenses = expenses.reduce((sum, t) => sum + t.amount_in_account_currency, 0);
    const totalIncome = income.reduce((sum, t) => sum + t.amount_in_account_currency, 0);

    const categoryMap = new Map<string, { name: string; icon: string; amount: number }>();
    expenses.forEach((t) => {
      if (t.category) {
        const cat = t.category as { name: string; icon: string };
        const existing = categoryMap.get(cat.name) || { name: cat.name, icon: cat.icon, amount: 0 };
        existing.amount += t.amount_in_account_currency;
        categoryMap.set(cat.name, existing);
      }
    });

    const topCategories = Array.from(categoryMap.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    return {
      totalExpenses,
      totalIncome,
      balance: totalIncome - totalExpenses,
      topCategories,
      transactionCount: transactions.length,
    };
  }

  /**
   * Al editar gasto/ingreso: mismo criterio que al crear (cotización entre moneda del comprobante y cuenta).
   */
  async recomputeExpenseIncomeAmountFields(
    amount: number,
    currency: string,
    accountCurrency: string
  ): Promise<{ amount_in_account_currency: number; exchange_rate: number | null }> {
    const { amountInAccountCurrency, exchangeRate } = await computeAmountInAccountCurrencyForAccount(
      amount,
      currency,
      accountCurrency
    );
    return {
      amount_in_account_currency: amountInAccountCurrency,
      exchange_rate: exchangeRate !== 1 ? exchangeRate : null,
    };
  }

  /**
   * Recalcula `amount_in_account_currency` y `exchange_rate` con la cotización actual (como al crear el movimiento)
   * para gastos/ingresos en moneda distinta a la de la cuenta. El trigger de saldos aplica el delta.
   */
  async repairCrossCurrencyInDateRange(
    userId: string,
    accountId: string,
    startDateYmd: string,
    endDateYmd: string,
    options?: { force?: boolean; onlyUsd?: boolean }
  ): Promise<{
    updated: number;
    sameCurrency: number;
    filteredOut: number;
    alreadyAligned: number;
  }> {
    const supabase = createServiceClientSync();

    const { data: account, error: accErr } = await supabase
      .from('accounts')
      .select('currency')
      .eq('id', accountId)
      .eq('user_id', userId)
      .single();

    if (accErr || !account) {
      throw new Error('Cuenta no encontrada');
    }

    const accountCurrency = account.currency;

    const { data: rows, error: qErr } = await supabase
      .from('transactions')
      .select('id, amount, currency, amount_in_account_currency, type')
      .eq('user_id', userId)
      .eq('account_id', accountId)
      .in('type', ['expense', 'income'])
      .gte('transaction_date', `${startDateYmd}T00:00:00`)
      .lte('transaction_date', `${endDateYmd}T23:59:59`)
      .order('transaction_date', { ascending: true })
      .limit(5000);

    if (qErr) throw qErr;

    let updated = 0;
    let sameCurrency = 0;
    let filteredOut = 0;
    let alreadyAligned = 0;

    for (const tx of rows || []) {
      const txCur = normalizeCurrency(tx.currency);
      const accCur = normalizeCurrency(accountCurrency);
      if (txCur === accCur) {
        sameCurrency++;
        continue;
      }

      if (options?.onlyUsd && txCur !== 'USD') {
        filteredOut++;
        continue;
      }

      const oldAin = Number(tx.amount_in_account_currency);
      const rec = await this.recomputeExpenseIncomeAmountFields(
        Number(tx.amount),
        tx.currency,
        accountCurrency
      );

      const diff = Math.abs(rec.amount_in_account_currency - oldAin);
      if (!options?.force && diff < 0.01) {
        alreadyAligned++;
        continue;
      }

      const { error: uErr } = await supabase
        .from('transactions')
        .update({
          amount_in_account_currency: rec.amount_in_account_currency,
          exchange_rate: rec.exchange_rate,
        })
        .eq('id', tx.id)
        .eq('user_id', userId);

      if (uErr) throw uErr;
      updated++;
    }

    return { updated, sameCurrency, filteredOut, alreadyAligned };
  }
}

export const transactionsService = new TransactionsService();
