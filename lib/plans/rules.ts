/** Account limits and OCR/AI quotas were dropped (decision 2026-10-15); null = unlimited. */
export const PLAN_LIMITS = {
  free: { accounts: null, ocr: null, ai: null },
  premium: { accounts: null, ocr: null, ai: null },
} as const;
export type PlanName = keyof typeof PLAN_LIMITS;
export type MeteredFeature = 'ocr' | 'ai';
export interface PlanState {
  status: string;
  current_period_end: string | null;
  grace_period_end: string | null;
}

function future(value: string | null, now: Date): boolean {
  return value !== null && Number.isFinite(Date.parse(value)) && Date.parse(value) > now.getTime();
}

/** A canceled renewal keeps its already-paid entitlement until the exact period end. */
export function effectivePlan(state: PlanState | null, now = new Date()): PlanName {
  if (!state) return 'free';
  // Production parity: any ACTIVE user keeps full access (no paid-period requirement).
  if (state.status === 'ACTIVE' || state.status === 'GRACE_PERIOD') return 'premium';
  if (state.status === 'CANCELED' && future(state.current_period_end, now)) {
    return 'premium';
  }
  return 'free';
}

export const PLAN_ERROR_MESSAGES: Readonly<Record<string, { status: number; message: string }>> = {
  plan_premium_required: { status: 403, message: 'Esta función requiere Premium vigente.' },
  plan_quota_exhausted: { status: 429, message: 'Alcanzaste el cupo de esta función para tu ciclo. Se renueva con el próximo período abonado.' },
  plan_request_in_progress: { status: 409, message: 'Esta solicitud ya está en proceso. Esperá antes de reintentar.' },
  plan_invalid_selection: { status: 400, message: 'La solicitud no corresponde a tu usuario.' },
  plan_request_conflict: { status: 409, message: 'La clave de esta solicitud ya se usó con otro contenido.' },
};
export function planError(error: unknown) {
  const message = typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : '';
  return PLAN_ERROR_MESSAGES[message];
}
