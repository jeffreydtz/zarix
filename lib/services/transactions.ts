import { nextFinancialRequestId } from '@/lib/financial-request-context';
import { ApiError } from '@/lib/api-handler';
import { FxUnavailableError } from '@/lib/executable-fx';
import { transactionRequestHash, validTransactionRequestId } from '@/lib/transaction-idempotency';
import { createServiceClientSync } from '@/lib/supabase/server';
import { normalizeCurrency } from '@/lib/transaction-exchange';
import { accountsService, normalizeDebtBalanceForStorage } from './accounts';
import { cotizacionesService } from './cotizaciones';
import { readAllPages } from '@/lib/supabase-paginated-read';
import {
  endOfMonthYmd,
  startOfMonthYmd,
  transactionCivilYmd,
  ymdToQueryExclusiveEndIso,
  ymdToQueryStartIso,
} from '@/lib/transaction-date';
import { observe, observedStep } from '@/lib/observability/correlation';
import type { Transaction, Account } from '@/types/database';
import { integerCentsFromToken, numberToDecimalString } from '@/lib/money-amount';

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
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }
  return Math.round(amount * 1e8) / 1e8;
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
  /** Convierte el monto original del movimiento a ARS. Devuelve null para monedas excluidas. */
  toArs: (t: { amount: number; currency: string | null }) => number | null;
  /**
   * Monedas cuya cotización no se pudo obtener: sus movimientos se EXCLUYEN de
   * los totales (sumar 1:1 contaba 100 USD como 100 ARS). Los consumidores
   * deben mostrar una aclaración cuando no esté vacío.
   */
  excludedCurrencies: string[];
}

async function observedExchangeRate(from: string, to: string, unavailable: string): Promise<number> {
  return observedStep({ component: 'provider', action: 'lookup', failureClass: 'provider' }, async () => {
    const rate = await cotizacionesService.getExchangeRate(from, to);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw Object.assign(new FxUnavailableError(`${from}/${to}`), { message: unavailable });
    }
    return rate;
  });
}

/**
 * Conversor a ARS por movimiento (monto original × cotización actual). Sumar
 * amount_in_account_currency mezcla ARS, USD, EUR, etc. en un total sin sentido
 * para usuarios multi-moneda; usar esto en resúmenes (dashboard y crons).
 * Los agregados no incluyen estimaciones con FX vencido ni marcado stale,
 * aunque ese último valor siga disponible para mostrar saldos individuales.
 * Si una cotización falla o está stale, esa moneda se excluye de los totales
 * y queda listada en `excludedCurrencies` para que el consumidor lo aclare.
 */
export async function buildToArsConverter(
  transactions: Array<{ currency: string | null }>
): Promise<ToArsConverter> {
  const currencies = Array.from(
    new Set(transactions.map((t) => normalizeCurrency(t.currency)))
  );
  const rateToArs = new Map<string, number>();
  const excludedCurrencies: string[] = [];
  const fiatRates = currencies.some(c => c === 'USD' || c === 'EUR')
    ? await cotizacionesService.getTransactionsFxRates(currencies).catch(error => {
      if (!(error instanceof FxUnavailableError)) throw error;
      return null;
    })
    : null;
  for (const c of currencies) {
    if (c === 'ARS') {
      rateToArs.set(c, 1);
      continue;
    }
    try {
      const fiat = c === 'USD' || c === 'EUR';
      const rate = fiat
        ? fiatRates && !fiatRates.stale ? (c === 'USD' ? fiatRates.usdArs : fiatRates.eurArs) : null
        : await observedExchangeRate(c, 'ARS', 'Cotización inválida');
      if (rate == null || !Number.isFinite(rate) || rate <= 0) {
        throw new FxUnavailableError(`${c}/ARS`);
      }
      rateToArs.set(c, rate);
    } catch (error) {
      if (!(error instanceof FxUnavailableError)) throw error;
      excludedCurrencies.push(c);
    }
  }
  return {
    toArs: (t) => {
      const rate = rateToArs.get(normalizeCurrency(t.currency));
      return rate == null ? null : Number(t.amount) * rate;
    },
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
  const exchangeRate = await observedExchangeRate(currency, accountCurrency,
    'No hay una cotización válida para convertir el movimiento.');
  return { amountInAccountCurrency: amount * exchangeRate, exchangeRate };
}

/** Valores de la transferencia antes de persistir la tasa con su escala SQL. */
export async function computeTransferAmounts(
  amount: number,
  currency: string,
  sourceCurrency: string,
  destinationCurrency: string,
  override?: number | null
): Promise<{ amountInSource: number; amountInDestination: number; exchangeRate: number }> {
  const inputCurrency = normalizeCurrency(currency);
  const source = normalizeCurrency(sourceCurrency);
  const destination = normalizeCurrency(destinationCurrency);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Monto inválido o con demasiados decimales.');
  }
  const transferFiat = ['ARS', 'USD', 'EUR'].includes(inputCurrency);
  if (transferFiat && integerCentsFromToken(numberToDecimalString(amount)) == null) {
    throw new Error('Monto inválido o con demasiados decimales.');
  }
  if (!transferFiat && Math.abs(roundFiat(amount, inputCurrency) - amount) > 1e-8) {
    throw new Error('Monto inválido o con demasiados decimales.');
  }
  if (inputCurrency !== source && inputCurrency !== destination) {
    throw new Error('El monto de transferencia debe estar en la moneda origen o destino.');
  }
  if (override != null && (!Number.isFinite(override) || override <= 0)) {
    throw new Error('La cotización manual debe ser finita y mayor a cero.');
  }
  let exchangeRate = 1;
  let amountInSource = amount;
  if (source !== destination) {
    const rate = override ?? await observedExchangeRate(inputCurrency,
      inputCurrency === source ? destination : source, 'No hay una cotización válida para la transferencia.');
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('No hay una cotización válida para la transferencia.');
    if (inputCurrency === source) exchangeRate = rate;
    else amountInSource = amount * rate;
  }
  amountInSource = roundFiat(amountInSource,source);
  const amountInDestination = roundFiat(amount * exchangeRate,destination);
  if (!Number.isFinite(amountInSource) || !Number.isFinite(amountInDestination) ||
      amountInSource <= 0 || amountInDestination <= 0) {
    throw new Error('El importe convertido de la transferencia debe ser mayor a cero.');
  }
  return { amountInSource, amountInDestination, exchangeRate };
}

export interface CreateTransactionInput {
  /** Stable logical operation ID, retained by the caller across every retry. */
  requestId?: string;
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
  isRecurring?: boolean;
  recurringRuleId?: string | null;
  /** Channel that created the row: web, telegram, wallet, api, mcp. */
  source?: 'web' | 'telegram' | 'wallet' | 'api' | 'mcp' | 'email' | 'statement';
  /** Canonical caller intent for replay hashing (original amount/currency before FX). */
  idempotencyIntent?: Record<string, unknown>;
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
  async peekDurableRequest(
    userId: string,
    requestId: string
  ): Promise<{ request_hash: string; response: Transaction } | null> {
    if (!validTransactionRequestId(requestId)) return null;
    const supabase = createServiceClientSync();
    const { data, error } = await supabase
      .from('transaction_requests')
      .select('request_hash, response')
      .eq('user_id', userId)
      .eq('request_id', requestId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.response) return null;
    return { request_hash: data.request_hash as string, response: data.response as Transaction };
  }

  async create(input: CreateTransactionInput): Promise<Transaction> {
    return observedStep({ component: 'service', action: 'execute', failureClass: 'consistency',
      referenceType: 'transaction' }, async () => {
    // Normalizamos la moneda a mayúsculas antes de cualquier insert: el CHECK
    // `currency = upper(currency)` (migración data_integrity) lo exige, y evita
    // los mismatches por comparación de strings aguas abajo.
    input = { ...input, requestId: input.requestId ?? nextFinancialRequestId(), currency: (input.currency || 'ARS').trim().toUpperCase() };
    const channel = input.source ?? 'web';
    if (!['expense', 'income', 'transfer', 'adjustment'].includes(input.type)) {
      throw new Error('Tipo de movimiento inválido.');
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new Error('El monto debe ser finito y mayor a cero.');
    }
    const fiat = ['ARS', 'USD', 'EUR'].includes(input.currency);
    if (fiat && integerCentsFromToken(numberToDecimalString(input.amount)) == null) {
      throw new ApiError('El monto en ARS, USD o EUR admite hasta dos decimales.');
    }
    const amount = roundFiat(input.amount, input.currency);
    if (amount <= 0 || (!fiat && Math.abs(amount - input.amount) > 1e-8)) {
      throw new ApiError('El monto en ARS, USD o EUR admite hasta dos decimales.');
    }
    input = { ...input, amount };
    if (input.installments != null &&
        (!Number.isInteger(input.installments) || input.installments < 1 || input.installments > 36)) {
      throw new Error('Las cuotas deben ser un entero entre 1 y 36.');
    }
    if (input.installments && input.installments > 1 && input.type !== 'expense') {
      throw new Error('Las cuotas sólo se admiten para gastos.');
    }
    if (input.type === 'transfer' && input.accountId === input.destinationAccountId) {
      throw new Error('La cuenta origen y destino deben ser distintas.');
    }
    if (input.exchangeRateOverride != null &&
        (!Number.isFinite(input.exchangeRateOverride) || input.exchangeRateOverride <= 0)) {
      throw new Error('La cotización manual debe ser finita y mayor a cero.');
    }
    const supabase = createServiceClientSync();
    const requestHash = input.requestId
      ? transactionRequestHash((input.idempotencyIntent ?? input) as Record<string, unknown>)
      : null;
    if (input.requestId) {
      if (!validTransactionRequestId(input.requestId)) throw new ApiError('Identificador de solicitud inválido.');
      // A committed reply survives response loss, account archival, and changed FX rates.
      const { data: prior, error } = await supabase.from('transaction_requests')
        .select('request_hash, response').eq('user_id', input.userId)
        .eq('request_id', input.requestId).maybeSingle();
      if (error) throw error;
      if (prior) {
        if (prior.request_hash !== requestHash) throw new ApiError('La solicitud ya se usó con otros datos.', 409);
        observe({ component: 'database', action: 'replay', outcome: 'success',
          referenceType: 'transaction', referenceId: (prior.response as Transaction).id });
        return prior.response as Transaction;
      }
    }
    const persist = async (row: Record<string, unknown>, installments = 1): Promise<Transaction> => {
      return observedStep({ component: 'database', action: 'persist', failureClass: 'consistency',
        referenceType: 'transaction' }, async () => {
      if (input.requestId) {
        const { data, error } = await supabase.rpc('create_transaction_once', {
          p_user_id: input.userId, p_request_id: input.requestId, p_request_hash: requestHash,
          p_transaction: row, p_installments: installments,
        });
        if (error?.code === 'Z0001') throw new ApiError('La solicitud ya se usó con otros datos.', 409);
        if (error) throw error;
        return data as Transaction;
      }
      const { data, error } = await supabase.from('transactions').insert(row).select().single();
      if (error) throw error;
      return data;
      }, result => result.id);
    };

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
      if (input.requestId) {
        return persist({ user_id: input.userId, account_id: input.accountId, type: input.type,
          amount: input.amount, currency: input.currency, category_id: input.categoryId || null,
          description: input.description || 'Compra en cuotas',
          transaction_date: input.transactionDate || new Date().toISOString(),
          source: channel,
        }, input.installments);
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
        p_source: channel,
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

      const transfer = await computeTransferAmounts(
        input.amount, input.currency, account.data.currency,
        destAccount.data.currency, input.exchangeRateOverride
      );

      return persist({
          user_id: input.userId,
          type: 'transfer',
          account_id: input.accountId,
          destination_account_id: input.destinationAccountId,
          amount: input.amount,
          currency: input.currency,
          amount_in_account_currency: transfer.amountInSource,
          destination_amount_in_account_currency: transfer.amountInDestination,
          exchange_rate: transfer.exchangeRate !== 1 ? transfer.exchangeRate : null,
          description: input.description || 'Transferencia entre cuentas',
          transaction_date: input.transactionDate || new Date().toISOString(),
          source: channel,
        });
    }

    const roundedAmount = roundFiat(input.amount, input.currency);
    const roundedAin = roundFiat(amountInAccountCurrency, account.data.currency);
    if (!Number.isFinite(roundedAin) || roundedAin <= 0) {
      throw new Error('El importe convertido del movimiento debe ser mayor a cero.');
    }

    return persist({
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
        source: channel,
      });
    }, result => result.id);
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

    // Primary-key + owner filters can match at most one row.
    if (error?.code === 'PGRST116') throw new ApiError('Movimiento no encontrado', 404);
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
   * Recalcula el saldo bajo el mismo bloqueo de cuenta que usa el trigger.
   * Útil si hubo inconsistencias (p. ej. borrar un ajuste antes de que el trigger lo revierta).
   */
  async recomputeAccountBalanceFromLedger(
    userId: string,
    accountId: string
  ): Promise<{ before: number; after: number }> {
    const supabase = createServiceClientSync();

    const { data, error } = await supabase.rpc('recompute_account_balance', {
      p_user_id: userId,
      p_account_id: accountId,
    });
    if (error) throw error;
    if (!data || typeof data.before !== 'number' || typeof data.after !== 'number') {
      throw new Error('Respuesta inválida al recalcular el saldo');
    }
    return { before: data.before, after: data.after };
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

    const civil = transactionCivilYmd(month.toISOString());
    const startYmd = startOfMonthYmd(civil);
    const endYmd = endOfMonthYmd(startYmd);

    const activeIds = await accountsService.getActiveAccountIds(userId);
    const transactions = await readAllPages<TransactionWithCategory>((from, to) => {
      let monthQuery = supabase
        .from('transactions')
        .select('*, category:categories(name, icon)')
        .eq('user_id', userId)
        .gte('transaction_date', ymdToQueryStartIso(startYmd))
        .lt('transaction_date', ymdToQueryExclusiveEndIso(endYmd));
      monthQuery = applyArchivedAccountsTransactionFilter(monthQuery, activeIds);
      return monthQuery.order('transaction_date', { ascending: true })
        .order('id', { ascending: true }).range(from, to);
    });

    const expenses = transactions.filter((t) => t.type === 'expense');
    const income = transactions.filter((t) => t.type === 'income');

    // Normalizamos TODO a ARS. Sumar amount_in_account_currency mezclaba ARS, USD,
    // EUR, etc. en un total sin sentido para cualquier usuario multi-moneda (el
    // caso central de la app). Convertimos el monto original de cada movimiento.
    // Monedas sin cotización quedan fuera de los totales (ver excludedCurrencies).
    const { toArs, excludedCurrencies } = await buildToArsConverter(transactions);

    const totalExpenses = expenses.reduce((sum, t) => {
      const amount = toArs(t);
      return amount == null ? sum : sum + amount;
    }, 0);
    const totalIncome = income.reduce((sum, t) => {
      const amount = toArs(t);
      return amount == null ? sum : sum + amount;
    }, 0);

    const categoryMap = new Map<string, { name: string; icon: string; amount: number }>();
    expenses.forEach((t) => {
      const amount = toArs(t);
      if (amount == null) return;
      if (t.category) {
        const cat = t.category as { name: string; icon: string };
        const existing = categoryMap.get(cat.name) || { name: cat.name, icon: cat.icon, amount: 0 };
        existing.amount += amount;
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
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Monto inválido o con demasiados decimales.');
    }
    const editFiat = ['ARS', 'USD', 'EUR'].includes((currency || '').toUpperCase());
    if (editFiat && integerCentsFromToken(numberToDecimalString(amount)) == null) {
      throw new Error('Monto inválido o con demasiados decimales.');
    }
    if (!editFiat && Math.abs(roundFiat(amount, currency) - amount) > 1e-8) {
      throw new Error('Monto inválido o con demasiados decimales.');
    }
    const { amountInAccountCurrency, exchangeRate } = await computeAmountInAccountCurrencyForAccount(
      amount,
      currency,
      accountCurrency
    );
    const appliedAmount = roundFiat(amountInAccountCurrency,accountCurrency);
    if (!Number.isFinite(appliedAmount) || appliedAmount <= 0) {
      throw new Error('El importe convertido del movimiento debe ser mayor a cero.');
    }
    return {
      amount_in_account_currency: appliedAmount,
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
