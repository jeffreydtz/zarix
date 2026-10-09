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
    // The shared submission layer recovers the owner-scoped durable draft BEFORE
    // creating an ID, including after this component or browser has restarted.
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
