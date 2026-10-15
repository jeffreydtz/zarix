import { submitFinancialOperation, type QueuedOperation } from '@/lib/offline-transaction-store';

export interface AccountCreationAttempt {
  pending?: QueuedOperation;
  inFlight?: boolean;
}
export type AccountCreationOutcome =
  | { state: 'confirmed'; account: Record<string, any> }
  | { state: 'pending'; message: string };

/** Both account forms keep their fields and persisted draft until a receipt. */
export async function submitAccountCreation(
  attempt: AccountCreationAttempt,
  payload: Record<string, unknown>,
  options: { online: boolean; onPending?: (original: Record<string, unknown>) => void },
  dependencies = { submit: submitFinancialOperation }
): Promise<AccountCreationOutcome> {
  if (attempt.inFlight) return { state: 'pending', message: 'La solicitud ya está en proceso.' };
  attempt.inFlight = true;
  try {
    // Each form owns its attempt. Only its explicit pending ID denotes a retry;
    // a new form may legitimately create an identical account. After restart,
    // the queue can resume a selected persisted operation with its original ID.
    const result = await dependencies.submit('/api/accounts', payload, 'POST', attempt.pending, '/api/accounts');
    if (result.state !== 'confirmed') {
      attempt.pending = result.item;
      options.onPending?.(result.item.payload as Record<string, unknown>);
      return { state: 'pending', message: !options.online
        ? 'Solicitud guardada, todavía sin confirmar. Se reintentará con conexión usando la misma clave.'
        : result.error || 'La solicitud sigue guardada sin confirmar. Reintentá la misma solicitud.' };
    }
    attempt.pending = undefined;
    return { state: 'confirmed', account: result.receipt };
  } finally {
    attempt.inFlight = false;
  }
}
