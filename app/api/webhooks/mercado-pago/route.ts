import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { createServiceClientSync } from '@/lib/supabase/server';
import { mercadoPagoService } from '@/lib/services/mercado-pago-service';
import { subscriptionsService } from '@/lib/services/subscriptions';
import { timingSafeStringEqual } from '@/lib/secure-compare';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Valida la firma HMAC del webhook de Mercado Pago (`x-signature` + `x-request-id`).
 * Manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` → HMAC-SHA256 con MP_WEBHOOK_SECRET.
 * Si el secret no está configurado, NO bloquea (preserva prod) pero loguea el riesgo.
 */
function verifyMercadoPagoSignature(req: NextRequest): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MP_WEBHOOK_SECRET no configurado: validación de firma deshabilitada');
    return true;
  }

  const xSignature = req.headers.get('x-signature');
  const xRequestId = req.headers.get('x-request-id');
  if (!xSignature) return false;

  let ts: string | null = null;
  let v1: string | null = null;
  for (const part of xSignature.split(',')) {
    const [rawKey, rawVal] = part.split('=');
    const key = rawKey?.trim();
    const val = rawVal?.trim();
    if (key === 'ts') ts = val;
    else if (key === 'v1') v1 = val;
  }
  if (!ts || !v1) return false;

  const dataId =
    req.nextUrl.searchParams.get('data.id') || req.nextUrl.searchParams.get('id');

  let manifest = '';
  if (dataId) manifest += `id:${dataId.toLowerCase()};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  const computed = createHmac('sha256', secret).update(manifest).digest('hex');
  return timingSafeStringEqual(computed, v1);
}

interface ProcessWebhookInput {
  payload: unknown;
  searchParams: URLSearchParams;
}

async function resolveUserIdFromPreapproval(
  preapprovalId: string,
  externalReference: string | null
): Promise<string | null> {
  const supabase = createServiceClientSync();
  const byPreapproval = await supabase
    .from('users')
    .select('id')
    .eq('mp_preapproval_id', preapprovalId)
    .maybeSingle();

  if (byPreapproval.data?.id) {
    return byPreapproval.data.id;
  }

  if (!externalReference) {
    return null;
  }

  const byExternalRef = await supabase
    .from('users')
    .select('id')
    .eq('id', externalReference)
    .maybeSingle();

  return byExternalRef.data?.id || null;
}

async function processWebhook({ payload, searchParams }: ProcessWebhookInput): Promise<void> {
  const preapprovalId = mercadoPagoService.extractPreapprovalId(payload, searchParams);
  if (!preapprovalId) {
    return;
  }

  const preapproval = await mercadoPagoService.getPreapproval(preapprovalId);
  const userId = await resolveUserIdFromPreapproval(
    preapproval.id,
    preapproval.external_reference
  );

  if (!userId) {
    console.warn('Mercado Pago webhook without matching user', {
      preapprovalId: preapproval.id,
      externalReference: preapproval.external_reference,
    });
    return;
  }

  const currentState = await subscriptionsService.getUserState(userId);
  const currentStatus = currentState?.status || 'PAST_DUE';
  const nextState = mercadoPagoService.mapPreapprovalStatusToSubscription(
    preapproval,
    currentStatus
  );

  await subscriptionsService.updateUserState({
    userId,
    status: nextState.status,
    currentPeriodEnd: nextState.currentPeriodEnd,
    gracePeriodEnd: nextState.gracePeriodEnd,
    mpPreapprovalId: preapproval.id,
  });
}

export async function POST(req: NextRequest) {
  if (!verifyMercadoPagoSignature(req)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  const payload = await req.json().catch(() => null);
  void processWebhook({ payload, searchParams: req.nextUrl.searchParams }).catch((error) => {
    console.error('Mercado Pago webhook processing error:', error);
  });
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  void processWebhook({ payload: null, searchParams: req.nextUrl.searchParams }).catch((error) => {
    console.error('Mercado Pago webhook processing error:', error);
  });
  return NextResponse.json({ ok: true });
}
