import { createServiceClientSync } from '@/lib/supabase/server';
import type { SubscriptionStatus } from '@/types/database';

export interface UserSubscriptionState {
  status: SubscriptionStatus;
  current_period_end: string | null;
  grace_period_end: string | null;
}

export interface UpdateSubscriptionStateInput {
  userId: string;
  status: SubscriptionStatus;
  currentPeriodEnd?: string | null;
  gracePeriodEnd?: string | null;
  mpPreapprovalId?: string | null;
}

const ALLOWED_ORCHESTRATOR_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  'ACTIVE',
  'GRACE_PERIOD',
]);

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
      .select('status, current_period_end, grace_period_end')
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

  hasOrchestratorAccess(status: SubscriptionStatus): boolean {
    return ALLOWED_ORCHESTRATOR_STATUSES.has(status);
  }

  getDeniedMessage(status: SubscriptionStatus | null): string {
    if (status === 'PAST_DUE') {
      return 'Tu suscripcion esta vencida por falta de pago. Actualiza tu metodo de pago para volver a usar el orquestador.';
    }
    if (status === 'CANCELED') {
      return 'Tu suscripcion esta cancelada. Reactivala para volver a usar el orquestador.';
    }
    return 'No encontramos una suscripcion activa para esta cuenta.';
  }

  async ensureOrchestratorAccess(userId: string): Promise<SubscriptionStatus> {
    const state = await this.getUserState(userId);
    const status = state?.status ?? null;
    if (!status || !this.hasOrchestratorAccess(status)) {
      throw new SubscriptionAccessError(this.getDeniedMessage(status), status);
    }
    return status;
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

    const { data, error } = await supabase
      .from('users')
      .update(payload)
      .eq('id', input.userId)
      .select('status, current_period_end, grace_period_end')
      .single();

    if (error) throw error;
    return data;
  }
}

export const subscriptionsService = new SubscriptionsService();
