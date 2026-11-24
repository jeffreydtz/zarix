import { effectivePlan, type PlanState } from '@/lib/plans/rules';
import { createServiceClientSync } from '@/lib/supabase/server';
import type { SubscriptionStatus } from '@/types/database';

export interface UserSubscriptionState {
  status: SubscriptionStatus;
  mp_preapproval_id: string | null;
  current_period_end: string | null;
  grace_period_end: string | null;
}

export interface UpdateSubscriptionStateInput {
  userId: string;
  status: SubscriptionStatus;
  currentPeriodEnd?: string | null;
  gracePeriodEnd?: string | null;
  mpPreapprovalId?: string | null;
  /** Snapshot read before a provider lookup; stale concurrent writes must retry. */
  expectedState?: UserSubscriptionState;
}

export class SubscriptionAccessError extends Error {
  readonly status: SubscriptionStatus | null;

  constructor(message: string, status: SubscriptionStatus | null) {
    super(message);
    this.name = 'SubscriptionAccessError';
    this.status = status;
  }
}

class SubscriptionsService {
  async getUserState(userId: string): Promise<UserSubscriptionState | null> {
    const supabase = createServiceClientSync();
    const { data, error } = await supabase
      .from('users')
      .select('status, current_period_end, grace_period_end, mp_preapproval_id')
      .eq('id', userId)
      .single();

    if (error) {
      if ((error as { code?: string }).code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  }

  hasOrchestratorAccess(state: PlanState): boolean {
    return effectivePlan(state) === 'premium';
  }

  getDeniedMessage(status: SubscriptionStatus | null): string {
    if (status === 'PAST_DUE') {
      return 'Tu suscripción está vencida por falta de pago. Actualizá tu método de pago para volver a usar el orquestador.';
    }
    if (status === 'CANCELED') {
      return 'Tu suscripción está cancelada. Reactivala para volver a usar el orquestador.';
    }
    return 'No encontramos una suscripción activa para esta cuenta.';
  }

  async ensureOrchestratorAccess(userId: string): Promise<SubscriptionStatus> {
    const state = await this.getUserState(userId);
    const status = state?.status ?? null;
    if (!state || !this.hasOrchestratorAccess(state)) {
      throw new SubscriptionAccessError(this.getDeniedMessage(status), status);
    }
    return state.status;
  }

  async updateUserState(input: UpdateSubscriptionStateInput): Promise<UserSubscriptionState> {
    const supabase = createServiceClientSync();
    const payload: {
      status: SubscriptionStatus;
      current_period_end?: string | null;
      grace_period_end?: string | null;
      mp_preapproval_id?: string | null;
    } = {
      status: input.status,
    };

    if (input.currentPeriodEnd !== undefined) {
      payload.current_period_end = input.currentPeriodEnd;
    }
    if (input.gracePeriodEnd !== undefined) {
      payload.grace_period_end = input.gracePeriodEnd;
    }
    if (input.mpPreapprovalId !== undefined) {
      payload.mp_preapproval_id = input.mpPreapprovalId;
    }

    let query = supabase.from('users').update(payload).eq('id', input.userId);
    if (input.expectedState) {
      query = query.eq('status', input.expectedState.status);
      for (const field of ['mp_preapproval_id', 'current_period_end', 'grace_period_end'] as const) {
        const value = input.expectedState[field];
        query = value == null ? query.is(field, null) : query.eq(field, value);
      }
    }
    const { data, error } = await query
      .select('status, current_period_end, grace_period_end, mp_preapproval_id')
      .single();

    if (error) throw error;
    return data;
  }
}

export const subscriptionsService = new SubscriptionsService();
