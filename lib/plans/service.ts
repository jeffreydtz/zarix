import { AmbiguousFinancialMutationError } from '@/lib/financial-mutation-error';
import { createHash, randomUUID } from 'node:crypto';
import { createServiceClientSync } from '@/lib/supabase/server';
import { ApiError } from '@/lib/api-handler';
import { planError, type MeteredFeature } from './rules';

function throwPlanError(error: unknown): never {
  const known = planError(error);
  if (known) throw new ApiError(known.message, known.status);
  throw error;
}

export async function selectMovementAccounts(userId: string, accountIds: string[]): Promise<void> {
  const { error } = await createServiceClientSync().rpc('select_movement_accounts', {
    p_user_id: userId, p_account_ids: accountIds,
  });
  if (error) throwPlanError(error);
}

/**
 * Reserve before external work. Completed results replay without another provider call.
 * Explicit provider failure releases the slot. Ambiguous/crashed work stays reserved:
 * never automatically retry side effects whose outcome is unknown.
 */
export async function withPlanQuota<T>(input: {
  userId: string; feature: MeteredFeature; requestKey?: string; fingerprint: string;
}, work: () => Promise<T>): Promise<T> {
  const key = input.requestKey || randomUUID();
  if (key.length > 180 || !/^[a-zA-Z0-9:_-]+$/.test(key)) {
    throw new ApiError('La clave de la solicitud no es válida.', 400);
  }
  const fingerprint = createHash('sha256').update(input.fingerprint).digest('hex');
  const token = randomUUID();
  const db = createServiceClientSync();
  const args = { p_user_id: input.userId, p_feature: input.feature, p_request_key: key };
  const { data, error } = await db.rpc('reserve_plan_usage', {
    ...args, p_fingerprint: fingerprint, p_token: token,
  });
  if (error) throwPlanError(error);
  if (data?.replayed) return data.result as T;
  let result: T;
  try {
    result = await work();
  } catch (workError) {
    // The callback must not throw after partially committing financial writes.
    // The AI tool loop catches tool failures; provider transport errors are safe
    // only before a tool executes (caller marks ambiguous failures explicitly).
    if (!(workError instanceof AmbiguousFinancialMutationError)) {
      const released = await db.rpc('finish_plan_usage', { ...args, p_token: token, p_succeeded: false, p_result: null });
      if (released.error) console.error('Plan reservation release failed; retry remains blocked', released.error);
    }
    throw workError;
  }
  const completed = await db.rpc('finish_plan_usage', { ...args, p_token: token, p_succeeded: true, p_result: result });
  if (completed.error) throwPlanError(completed.error);
  return result;
}

export class AmbiguousPlanWorkError extends AmbiguousFinancialMutationError {
  constructor(cause: unknown) {
    super(cause);
    this.name = 'AmbiguousPlanWorkError';
  }
}
