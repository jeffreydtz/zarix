import { z } from 'zod';

const MAX_BATCH = 12;
const MAX_AMOUNT = 1_000_000_000;

const periodEnum = z
  .enum(['this_month', 'last_month', 'this_week', 'last_7_days', 'last_30_days', 'this_year'])
  .optional();

const amountSchema = z.number().finite().positive().max(MAX_AMOUNT);

export const FROZEN_CONFIRM_KEYS = new Set(['confirm', 'pendingId', 'pendingIds', 'requestId']);

export const remoteConfirmSchema = z
  .object({
    confirm: z.literal(true),
    pendingId: z.string().uuid().optional(),
    pendingIds: z.array(z.string().uuid()).max(MAX_BATCH).optional(),
    requestId: z.string().min(8).max(200).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.pendingId) || Boolean(value.pendingIds?.length), {
    message: 'Falta pendingId',
  });

export function remoteConfirmHasExtraFields(args: Record<string, unknown>): boolean {
  return Object.keys(args).some((key) => args[key] !== undefined && !FROZEN_CONFIRM_KEYS.has(key));
}

export const transactionFieldsSchema = z.object({
  type: z.enum(['expense', 'income', 'transfer']).optional(),
  amount: amountSchema.optional(),
  currency: z.string().max(8).optional(),
  account: z.string().max(120).optional().nullable(),
  accountId: z.string().uuid().optional(),
  category: z.string().max(80).optional(),
  categoryId: z.string().uuid().optional().nullable(),
  description: z.string().max(500).optional(),
  destinationAccount: z.string().max(120).optional(),
  destinationAccountId: z.string().uuid().optional(),
  installments: z.number().int().min(1).max(36).optional(),
  transactionDate: z.string().max(32).optional(),
  date: z.string().max(32).optional(),
  confirm: z.boolean().optional(),
  pendingId: z.string().uuid().optional(),
  pendingIds: z.array(z.string().uuid()).max(MAX_BATCH).optional(),
  requestId: z.string().min(8).max(200).optional(),
});

export const createTransactionSchema = transactionFieldsSchema.extend({
  type: z.enum(['expense', 'income', 'transfer']),
  amount: amountSchema,
});

export const createTransactionsSchema = z.object({
  transactions: z.array(createTransactionSchema).min(1).max(MAX_BATCH),
  confirm: z.boolean().optional(),
  pendingId: z.string().uuid().optional(),
  pendingIds: z.array(z.string().uuid()).max(MAX_BATCH).optional(),
  requestId: z.string().min(8).max(200).optional(),
});

export const createAccountSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  account: z.string().min(1).max(80).optional(),
  type: z.string().max(32).optional(),
  currency: z.string().max(8).optional(),
  confirm: z.boolean().optional(),
});

export const deleteLastTransactionSchema = z.object({
  confirm: z.boolean().optional(),
});

export const editLastTransactionSchema = z.object({
  amount: amountSchema.optional(),
  category: z.string().max(80).optional(),
  account: z.string().max(120).optional(),
  description: z.string().max(500).optional(),
  type: z.enum(['expense', 'income']).optional(),
  confirm: z.boolean().optional(),
});

export const getSpendingSchema = z.object({
  period: periodEnum,
  category: z.string().max(80).optional(),
});

export const listTransactionsSchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
  type: z.enum(['expense', 'income', 'transfer']).optional(),
  category: z.string().max(80).optional(),
  account: z.string().max(120).optional(),
  search: z.string().max(80).optional(),
  period: periodEnum,
});

export const emptySchema = z.object({});

export const createRecurringSchema = z.object({
  description: z.string().min(1).max(200),
  amount: amountSchema,
  currency: z.string().max(8).optional(),
  type: z.enum(['expense', 'income']).optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  category: z.string().max(80).optional(),
  account: z.string().max(120).optional(),
  startDate: z.string().max(32).optional(),
  confirm: z.boolean().optional(),
});

export const TOOL_SCHEMAS = {
  create_transaction: z.union([createTransactionSchema, remoteConfirmSchema]),
  create_transactions: z.union([createTransactionsSchema, remoteConfirmSchema]),
  create_account: createAccountSchema,
  delete_last_transaction: deleteLastTransactionSchema,
  edit_last_transaction: editLastTransactionSchema,
  get_spending: getSpendingSchema,
  list_transactions: listTransactionsSchema,
  get_budget_status: emptySchema,
  get_portfolio: emptySchema,
  get_net_worth: emptySchema,
  get_accounts: emptySchema,
  get_quotes: emptySchema,
  list_recurring: emptySchema,
  create_recurring: createRecurringSchema,
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;
export const MAX_TOOL_BATCH = MAX_BATCH;
export const MAX_TOOL_AMOUNT = MAX_AMOUNT;
