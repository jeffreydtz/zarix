export type InboxToolPayload = {
  type?: string;
  amount?: number;
  account?: string;
  accountId?: string;
  installments?: number;
  destinationAccount?: string;
  currency?: string;
};

export type InboxDraft = {
  id: string;
  amount: number | null;
  currency: string;
  merchant: string | null;
  card_name: string | null;
  account_id: string | null;
  status: string;
  direction?: 'expense' | 'income' | string;
  occurred_at?: string | null;
  created_at: string;
  tool_payload?: InboxToolPayload | null;
};

export type InboxAccount = { id: string; name: string; currency?: string };

export function effectiveInboxItem<T extends object>(item: T, edits?: Partial<T> | null): T {
  return { ...item, ...(edits || {}) };
}

export function confirmRequestFromDraft(effective: InboxDraft): {
  action: 'confirm';
  amount: number | undefined;
  merchant: string | null;
  accountId: string | null;
  currency: string;
} {
  return {
    action: 'confirm',
    amount: effective.amount == null ? undefined : Number(effective.amount),
    merchant: effective.merchant,
    accountId: effective.account_id,
    currency: effective.currency,
  };
}

export function confirmPreviewFromDraft(effective: InboxDraft, accounts: InboxAccount[]) {
  const parked = effective.tool_payload || {};
  const type = parked.type || (effective.direction === 'income' ? 'income' : 'expense');
  const amount = effective.amount ?? parked.amount ?? null;
  const accountId = effective.account_id || parked.accountId || null;
  const accountName =
    accounts.find((a) => a.id === accountId)?.name || parked.account || 'cuenta sin elegir';
  const installments = parked.installments && parked.installments > 1 ? parked.installments : 1;
  const directionLabel = type === 'income' ? 'Ingreso' : type === 'transfer' ? 'Transferencia' : 'Gasto';
  return {
    type,
    directionLabel,
    amount,
    currency: effective.currency,
    accountName,
    accountId,
    merchant: effective.merchant,
    installments,
    destinationAccount: parked.destinationAccount || null,
  };
}
