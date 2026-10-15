import { AmbiguousFinancialMutationError } from '@/lib/financial-mutation-error';
import type { MeteredFeature } from './rules';

/**
 * Plan quotas were dropped on 2026-10-15 (production parity): metered work runs
 * without reservation. The signature is kept so callers stay unchanged.
 */
export async function withPlanQuota<T>(_input: {
  userId: string; feature: MeteredFeature; requestKey?: string; fingerprint: string;
}, work: () => Promise<T>): Promise<T> {
  return work();
}

export class AmbiguousPlanWorkError extends AmbiguousFinancialMutationError {
  constructor(cause: unknown) {
    super(cause);
    this.name = 'AmbiguousPlanWorkError';
  }
}
