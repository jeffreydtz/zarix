import { AmbiguousFinancialMutationError } from '@/lib/financial-mutation-error';
import { createServiceClientSync } from '@/lib/supabase/server';
import { ApiError } from '@/lib/api-handler';
import type { MeteredFeature } from './rules';

/** Daily caps for accounts created after the 2026-10-15 deploy (enforced in SQL). */
export const AI_DAILY_CAPS: Readonly<Record<MeteredFeature, number>> = { ai: 20, ocr: 5 };

const CAP_MESSAGES: Readonly<Record<MeteredFeature, string>> = {
  ai: `Alcanzaste el límite diario de ${AI_DAILY_CAPS.ai} mensajes con la IA. Se renueva mañana.`,
  ocr: `Alcanzaste el límite diario de ${AI_DAILY_CAPS.ocr} lecturas de comprobantes. Se renueva mañana.`,
};

function isMissingQuotaFunction(error: { code?: string; message?: string }): boolean {
  // Deploy-order safety: until the migration is applied, keep the previous behavior.
  return error.code === 'PGRST202' || error.code === '42883' || /consume_ai_daily_quota/.test(error.message || '') && /not find|does not exist/i.test(error.message || '');
}

/**
 * Consumes one daily unit before external work (cron summaries skip the cap).
 * A provider failure after consumption still counts; there is no refund.
 */
export async function withPlanQuota<T>(input: {
  userId: string; feature: MeteredFeature; requestKey?: string; fingerprint: string; source?: 'cron';
}, work: () => Promise<T>): Promise<T> {
  if (input.source !== 'cron') {
    const { data, error } = await createServiceClientSync().rpc('consume_ai_daily_quota', {
      p_user_id: input.userId, p_feature: input.feature,
    });
    if (error) {
      if (!isMissingQuotaFunction(error)) throw error;
    } else if (data && (data as { allowed?: boolean }).allowed === false) {
      throw new ApiError(CAP_MESSAGES[input.feature], 429);
    }
  }
  return work();
}

export class AmbiguousPlanWorkError extends AmbiguousFinancialMutationError {
  constructor(cause: unknown) {
    super(cause);
    this.name = 'AmbiguousPlanWorkError';
  }
}
