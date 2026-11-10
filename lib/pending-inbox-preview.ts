export type InboxToolPayload = {
  type?: string;
  amount?: number;
  account?: string;
  accountId?: string;
  installments?: number;
  destinationAccount?: string;
  currency?: string;
  _tool?: string;
  reconcile?: { kind?: string; reason?: string };
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
  source?: string;
  possible_duplicate_of?: string | null;
  possible_duplicate?: {
    id: string;
    merchant: string | null;
    amount: number | null;
    currency: string;
    status: string;
  } | null;
  tool_payload?: InboxToolPayload | null;
};

export function inboxOriginalStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'confirmed':
      return 'confirmado';
    case 'discarded':
      return 'descartado';
    case 'confirming':
      return 'confirmando';
    case 'uncertain':
      return 'incierto';
    default:
      return 'pendiente';
  }
}

export type InboxAccount = { id: string; name: string; currency?: string };

export function effectiveInboxItem<T extends object>(item: T, edits?: Partial<T> | null): T {
  return { ...item, ...(edits || {}) };
}

export function inboxDraftAccountId(effective: InboxDraft): string | null {
  return effective.account_id || effective.tool_payload?.accountId || null;
}

export function confirmRequestFromDraft(effective: InboxDraft): {
  action: 'confirm';
  amount: number | null;
  merchant: string | null;
  accountId: string | null;
  currency: string;
} {
  return {
    action: 'confirm',
    amount: effective.amount == null ? null : Number(effective.amount),
    merchant: effective.merchant,
    accountId: inboxDraftAccountId(effective),
    currency: effective.currency,
  };
}

export function confirmPreviewFromDraft(effective: InboxDraft, accounts: InboxAccount[]) {
  const parked = effective.tool_payload || {};
  const type = parked.type || (effective.direction === 'income' ? 'income' : 'expense');
  // Cleared amount stays cleared — never restore parked/original silently.
  const amount = effective.amount;
  const accountId = inboxDraftAccountId(effective);
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
