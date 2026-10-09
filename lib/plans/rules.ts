/** Proposed v2.13 allowances. Prices are deliberately owned by billing configuration. */
export const PLAN_LIMITS = {
  free: { accounts: 3, ocr: 0, ai: 0 },
  premium: { accounts: 20, ocr: 20, ai: 40 },
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
  if ((state.status === 'ACTIVE' || state.status === 'CANCELED') && future(state.current_period_end, now)) {
    return 'premium';
  }
  if (state.status === 'GRACE_PERIOD' && state.current_period_end !== null && future(state.grace_period_end, now)) {
    return 'premium';
  }
  return 'free';
}

export const PLAN_ERROR_MESSAGES: Readonly<Record<string, { status: number; message: string }>> = {
  plan_account_limit: { status: 403, message: 'Alcanzaste el límite de cuentas habilitadas de tu plan. Elegí cuáles usar para nuevos movimientos en Cuentas.' },
  plan_selection_required: { status: 403, message: 'Elegí las cuentas que querés habilitar para nuevos movimientos en Cuentas. Tu historial se conserva.' },
  plan_account_disabled: { status: 403, message: 'Esta cuenta no está habilitada para nuevos movimientos. Podés cambiar la selección en Cuentas.' },
  plan_premium_required: { status: 403, message: 'Esta función requiere Premium vigente.' },
  plan_quota_exhausted: { status: 429, message: 'Alcanzaste el cupo de esta función para tu ciclo. Se renueva con el próximo período abonado.' },
  plan_request_in_progress: { status: 409, message: 'Esta solicitud ya está en proceso. Esperá antes de reintentar.' },
  plan_request_conflict: { status: 409, message: 'La clave de esta solicitud ya se usó con otro contenido.' },
  plan_invalid_selection: { status: 400, message: 'La selección debe incluir solo tus cuentas activas, sin repetidas.' },
};
export function planError(error: unknown) {
  const message = typeof error === 'object' && error !== null && 'message' in error ? String(error.message) : '';
  return PLAN_ERROR_MESSAGES[message];
}
