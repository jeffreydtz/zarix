import { createServiceClientSync } from '@/lib/supabase/server';
import { readAllPages } from '@/lib/supabase-paginated-read';
import {
  addMonthsYmd,
  civilTodayYmd,
  transactionCivilYmd,
  ymdToQueryExclusiveEndIso,
  ymdToQueryStartIso,
} from '@/lib/transaction-date';
import type { Account, Transaction } from '@/types/database';
import {
  CARD_STATEMENT_CYCLES,
  CARD_STATEMENT_LOOKAHEAD_MONTHS,
  projectCardStatement,
  type CardCharge,
  type CardStatementAccount,
  type CardStatementProjection,
} from '@/lib/card-statement';

const CHARGE_SELECT =
  'id, account_id, destination_account_id, type, amount, currency, amount_in_account_currency, destination_amount_in_account_currency, transaction_date, description, installment_number, installment_total, installment_group_id';

type ChargeRow = Pick<
  Transaction,
  | 'id'
  | 'account_id'
  | 'destination_account_id'
  | 'type'
  | 'amount'
  | 'currency'
  | 'amount_in_account_currency'
  | 'destination_amount_in_account_currency'
  | 'transaction_date'
  | 'description'
  | 'installment_number'
  | 'installment_total'
  | 'installment_group_id'
>;

function asCardAccount(account: Account): CardStatementAccount {
  return {
    id: account.id,
    name: account.name,
    last_4_digits: account.last_4_digits,
    currency: account.currency,
    secondary_currency: account.secondary_currency,
    is_multicurrency: account.is_multicurrency,
    closing_day: account.closing_day,
    due_day: account.due_day,
  };
}

function amountForCard(tx: ChargeRow, cardId: string): number {
  if (tx.account_id === cardId) {
    return Math.abs(Number(tx.amount_in_account_currency ?? tx.amount));
  }
  if (tx.destination_account_id === cardId) {
    return Math.abs(Number(tx.destination_amount_in_account_currency ?? tx.amount));
  }
  return Math.abs(Number(tx.amount));
}

export function transactionToCardCharge(tx: ChargeRow, cardId: string): CardCharge | null {
  const dateISO = transactionCivilYmd(tx.transaction_date);
  const amount = amountForCard(tx, cardId);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const isPayment =
    tx.type === 'transfer' && tx.destination_account_id === cardId && tx.account_id !== cardId;
  const isCharge =
    tx.account_id === cardId && (tx.type === 'expense' || tx.type === 'adjustment');

  if (!isPayment && !isCharge) return null;

  return {
    id: tx.id,
    accountId: cardId,
    kind: isPayment ? 'payment' : 'charge',
    amount,
    currency: (tx.currency || 'ARS').toUpperCase(),
    dateISO,
    description: tx.description,
    installmentNumber: tx.installment_number,
    installmentTotal: tx.installment_total,
    installmentGroupId: tx.installment_group_id,
  };
}

export async function loadCreditCards(
  userId: string,
  accountId?: string
): Promise<Account[]> {
  const supabase = createServiceClientSync();
  let query = supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('type', 'credit_card')
    .eq('is_active', true);
  if (accountId) query = query.eq('id', accountId);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as Account[]).filter((row) => row.type === 'credit_card');
}

export async function loadCardCharges(
  userId: string,
  cardIds: string[],
  fromISO: string,
  toISO: string
): Promise<CardCharge[]> {
  if (cardIds.length === 0) return [];
  const supabase = createServiceClientSync();
  const fromBound = ymdToQueryStartIso(fromISO);
  const toBound = ymdToQueryExclusiveEndIso(toISO);
  const inList = cardIds.map((id) => `"${id.replace(/"/g, '')}"`).join(',');
  const rows = await readAllPages<ChargeRow>((from, to) =>
    supabase
      .from('transactions')
      .select(CHARGE_SELECT)
      .eq('user_id', userId)
      .or(`account_id.in.(${inList}),destination_account_id.in.(${inList})`)
      .gte('transaction_date', fromBound)
      .lt('transaction_date', toBound)
      .order('transaction_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );

  const charges: CardCharge[] = [];
  for (const tx of rows) {
    for (const cardId of cardIds) {
      if (tx.account_id !== cardId && tx.destination_account_id !== cardId) continue;
      const mapped = transactionToCardCharge(tx, cardId);
      if (mapped) charges.push(mapped);
    }
  }
  return charges;
}

export async function getCardStatements(
  userId: string,
  options?: { accountId?: string; cycles?: number; todayISO?: string }
): Promise<CardStatementProjection[]> {
  const todayISO = options?.todayISO ?? civilTodayYmd();
  const cycles = options?.cycles ?? CARD_STATEMENT_CYCLES;
  const cards = await loadCreditCards(userId, options?.accountId);
  if (cards.length === 0) return [];

  const fromISO = addMonthsYmd(todayISO, -CARD_STATEMENT_LOOKAHEAD_MONTHS);
  const toISO = addMonthsYmd(todayISO, CARD_STATEMENT_LOOKAHEAD_MONTHS);
  const charges = await loadCardCharges(
    userId,
    cards.map((c) => c.id),
    fromISO,
    toISO
  );

  return cards.map((card) =>
    projectCardStatement(asCardAccount(card), charges, { todayISO, cycles })
  );
}

export async function getCardStatement(
  userId: string,
  accountId: string,
  options?: { cycles?: number; todayISO?: string }
): Promise<CardStatementProjection | null> {
  const [statement] = await getCardStatements(userId, { ...options, accountId });
  return statement ?? null;
}
