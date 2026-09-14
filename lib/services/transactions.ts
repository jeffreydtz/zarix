import { createHash } from 'node:crypto';
import { ApiError } from '@/lib/api-handler';
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

function roundFiat(amount: number, currency: string): number {
  const c = (currency || '').toUpperCase();
  if (c === 'ARS' || c === 'USD' || c === 'EUR') {
    return Math.round(amount * 100) / 100;
  }
  return amount;
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

export interface ToArsConverter {
  /** Convierte el monto original del movimiento a ARS. Devuelve 0 para monedas excluidas. */
  toArs: (t: { amount: number; currency: string | null }) => number;
  /**
   * Monedas cuya cotización no se pudo obtener: sus movimientos se EXCLUYEN de
   * los totales (sumar 1:1 contaba 100 USD como 100 ARS). Los consumidores
   * deben mostrar una aclaración cuando no esté vacío.
   */
  excludedCurrencies: string[];
}

/**
 * Conversor a ARS por movimiento (monto original × cotización actual). Sumar
 * amount_in_account_currency mezcla ARS, USD, EUR, etc. en un total sin sentido
 * para usuarios multi-moneda; usar esto en resúmenes (dashboard y crons).
 * Si una cotización falla, esa moneda se excluye de los totales y queda
 * listada en `excludedCurrencies` para que el consumidor lo aclare.
 */
export async function buildToArsConverter(
  transactions: Array<{ currency: string | null }>
): Promise<ToArsConverter> {
  const currencies = Array.from(
    new Set(transactions.map((t) => (t.currency || 'ARS').toUpperCase()))
  );
  const rateToArs = new Map<string, number>();
  const excludedCurrencies: string[] = [];
  for (const c of currencies) {
    if (c === 'ARS') {
      rateToArs.set(c, 1);
      continue;
    }
    try {
      rateToArs.set(c, await cotizacionesService.getExchangeRate(c, 'ARS'));
    } catch {
      excludedCurrencies.push(c);
    }
  }
  return {
    toArs: (t) => Number(t.amount) * (rateToArs.get((t.currency || 'ARS').toUpperCase()) ?? 0),
    excludedCurrencies,
  };
}

/** Aclaración estándar (es-AR) cuando hay monedas sin cotización en un resumen. */
export function excludedCurrenciesNote(excludedCurrencies: string[]): string | null {
  if (excludedCurrencies.length === 0) return null;
  return `⚠️ Sin cotización para ${excludedCurrencies.join(', ')}: esos movimientos no están incluidos en los totales.`;
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
  /** Stable offline request UUID. A replay returns the existing transaction; it never edits it. */
  clientRequestId?: string;
  /**
   * Solo transferencias entre monedas distintas: reemplaza la cotización del mercado.
   * - Monto en origen: unidades de moneda destino por 1 unidad de moneda origen (equivale a `getExchangeRate(origen, destino)`).
   * - Monto en destino: unidades de moneda origen por 1 unidad de moneda destino (equivale a `getExchangeRate(destino, origen)`).
   */
  exchangeRateOverride?: number | null;
  isRecurring?: boolean;
  recurringRuleId?: string | null;
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

const CLIENT_REQUEST_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Namespaced UUID: one user's request key cannot address another user's row. */
export function offlineTransactionId(userId: string, clientRequestId: string): string {
  if (!CLIENT_REQUEST_UUID.test(clientRequestId)) throw new ApiError('Identificador de solicitud inválido.', 400);
  const hex = createHash('sha256').update(`zarix:offline:v1:${userId}:${clientRequestId.toLowerCase()}`).digest('hex').slice(0, 32).split('');
  hex[12] = '8';
  hex[16] = ((parseInt(hex[16], 16) & 3) | 8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

class TransactionsService {
  async create(input: CreateTransactionInput): Promise<Transaction> {
    const supabase = createServiceClientSync();
    const transactionId = input.clientRequestId ? offlineTransactionId(input.userId, input.clientRequestId) : null;
    if (transactionId && input.installments && input.installments > 1) {
      throw new ApiError('Las solicitudes offline no admiten compras en cuotas.', 400);
    }
    const findReplay = async (): Promise<Transaction | null> => {
      if (!transactionId) return null;
      const { data, error } = await supabase.from('transactions').select('*')
        .eq('id', transactionId).eq('user_id', input.userId).maybeSingle();
      if (error) throw error;
      return data;
    };
    // The key identifies the first transaction, even if a retry sends changed fields.
    // Replay precedes account/rate reads so a lost response can recover after archiving.
    if (transactionId) {
      const replay = await findReplay();
      if (replay) return replay;
    }
    const inserted = async (data: Transaction | null, error: { code?: string } | null): Promise<Transaction> => {
      if (error) {
        // Concurrent inserts serialize on the existing PK; only the winner runs
        // the AFTER INSERT balance trigger. Other constraint failures still fail.
        if (transactionId && error.code === '23505') {
          const replay = await findReplay();
          if (replay) return replay;
        }
        throw error;
      }
      if (!data) throw new Error('No se pudo recuperar el movimiento guardado');
      return data;
    };

    // Normalizamos la moneda a mayúsculas antes de cualquier insert: el CHECK
    // `currency = upper(currency)` (migración data_integrity) lo exige, y evita
    // los mismatches por comparación de strings aguas abajo.
    input = { ...input, currency: (input.currency || 'ARS').trim().toUpperCase() };

    const account = await supabase
      .from('accounts')
      .select('*')
      .eq('id', input.accountId)
      .eq('user_id', input.userId)
      .single();

    if (account.error || !account.data) {
      throw new Error('Account not found');
    }
    if (account.data.is_active === false) {
      throw new Error('La cuenta está archivada. Reactivala para registrar movimientos.');
    }

    // Sin cuenta destino, una "transferencia" caería al insert genérico y la plata
    // desaparecería del origen sin acreditarse en ningún lado.
    if (input.type === 'transfer' && !input.destinationAccountId) {
      throw new Error('Las transferencias requieren una cuenta destino.');
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
      // El RPC create_installment_transactions guarda amount_in_account_currency
      // 1:1 sin convertir. Permitir cuotas en moneda distinta a la cuenta
      // descuadra el saldo (ej: 100 USD restados como 100 ARS). Hasta que el RPC
      // soporte FX, exigimos misma moneda.
      if (normalizeCurrency(input.currency) !== normalizeCurrency(account.data.currency)) {
        throw new Error(
          'Las compras en cuotas deben estar en la misma moneda que la cuenta. Convertí el monto o usá una cuenta en esa moneda.'
        );
      }
      if (input.installments < 2 || input.installments > 36) {
        throw new Error('Las cuotas tienen que ser entre 2 y 36.');
      }
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
        .eq('user_id', input.userId)
        .single();

      if (firstInstallment.error) throw firstInstallment.error;
      return firstInstallment.data;
    }

    if (input.type === 'transfer' && input.destinationAccountId) {
      const destAccount = await supabase
        .from('accounts')
        .select('*')
        .eq('id', input.destinationAccountId)
        .eq('user_id', input.userId)
        .single();

      if (destAccount.error || !destAccount.data) {
        throw new Error('Destination account not found');
      }
      if (destAccount.data.is_active === false) {
        throw new Error('La cuenta destino está archivada.');
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
        ...(transactionId ? { id: transactionId } : {}),
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

      return inserted(data, error);
    }

    const roundedAmount = roundFiat(input.amount, input.currency);
    const roundedAin = roundFiat(amountInAccountCurrency, account.data.currency);

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        ...(transactionId ? { id: transactionId } : {}),
        user_id: input.userId,
        type: input.type,
        account_id: input.accountId,
        amount: roundedAmount,
        currency: input.currency,
        amount_in_account_currency: roundedAin,
        exchange_rate: exchangeRate !== 1 ? exchangeRate : null,
        category_id: input.categoryId || null,
        description: input.description || null,
        notes: input.notes || null,
        tags: input.tags || null,
        transaction_date: input.transactionDate || new Date().toISOString(),
        is_recurring: input.isRecurring === true,
        recurring_rule_id: input.recurringRuleId || null,
      })
      .select()
      .single();

    return inserted(data, error);
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
      /** Ordenar por created_at (orden de carga) en vez de transaction_date. Para "el último que cargué". */
      orderByCreated?: boolean;
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

    query = options.orderByCreated
      ? query.order('created_at', { ascending: false }).order('id', { ascending: false })
      : query.order('transaction_date', { ascending: false }).order('id', { ascending: false });

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

    const before = Number(account.balance);
    const { error: updErr } = await supabase
      .from('accounts')
      .update({ balance, updated_at: new Date().toISOString() })
      .eq('id', accountId)
      .eq('user_id', userId);

    if (updErr) throw updErr;
    return { before, after: balance };
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
    const target = Number(targetBalance);
    if (!Number.isFinite(target)) {
      throw new Error('Saldo inválido');
    }

    const supabase = createServiceClientSync();
    // Atómico con FOR UPDATE dentro del RPC: evita la carrera read-then-write
    // (dos ajustes concurrentes leían el mismo saldo y lo duplicaban).
    const { error } = await supabase.rpc('create_balance_adjustment', {
      p_user_id: userId,
      p_account_id: accountId,
      p_target_balance: target,
    });

    if (error) {
      if ((error as { message?: string }).message?.includes('Cuenta no encontrada')) {
        throw new Error('Cuenta no encontrada');
      }
      throw error;
    }
  }

  async getMonthSummary(userId: string, month: Date) {
    const supabase = createServiceClientSync();

    const startOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
    const endOfMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59);

    const activeIds = await accountsService.getActiveAccountIds(userId);
    let monthQuery = supabase
      .from('transactions')
      .select('*, category:categories(name, icon)')
      .eq('user_id', userId)
      .gte('transaction_date', startOfMonth.toISOString())
      .lte('transaction_date', endOfMonth.toISOString());
    monthQuery = applyArchivedAccountsTransactionFilter(monthQuery, activeIds);
    const { data: transactions, error } = await monthQuery;

    if (error) throw error;

    const expenses = transactions.filter((t) => t.type === 'expense');
    const income = transactions.filter((t) => t.type === 'income');

    // Normalizamos TODO a ARS. Sumar amount_in_account_currency mezclaba ARS, USD,
    // EUR, etc. en un total sin sentido para cualquier usuario multi-moneda (el
    // caso central de la app). Convertimos el monto original de cada movimiento.
    // Monedas sin cotización quedan fuera de los totales (ver excludedCurrencies).
    const { toArs, excludedCurrencies } = await buildToArsConverter(transactions);

    const totalExpenses = expenses.reduce((sum, t) => sum + toArs(t), 0);
    const totalIncome = income.reduce((sum, t) => sum + toArs(t), 0);

    const categoryMap = new Map<string, { name: string; icon: string; amount: number }>();
    expenses.forEach((t) => {
      if (t.category) {
        const cat = t.category as { name: string; icon: string };
        const existing = categoryMap.get(cat.name) || { name: cat.name, icon: cat.icon, amount: 0 };
        existing.amount += toArs(t);
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
      /** Monedas sin cotización: sus movimientos no están en los totales. */
      excludedCurrencies,
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
