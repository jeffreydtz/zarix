import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'node:crypto';
import { createServiceClientSync } from '@/lib/supabase/server';
import { mercadoPagoService } from '@/lib/services/mercado-pago-service';
import { subscriptionsService } from '@/lib/services/subscriptions';
import { mapAuthorizedPayment } from '@/lib/billing/subscription-events';
import { timingSafeStringEqual } from '@/lib/secure-compare';
import { observedRequest, observedStep } from '@/lib/observability/correlation';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Valida la firma HMAC del webhook de Mercado Pago (`x-signature` + `x-request-id`).
 * Manifest: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` → HMAC-SHA256 con MP_WEBHOOK_SECRET.
 * Fail-closed: sin MP_WEBHOOK_SECRET se rechaza (prod y resto).
 */
function verifyMercadoPagoSignature(req: NextRequest, signedId: string): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    // Fail-closed: sin secret no se puede validar la firma. Aceptar igual dejaría
    // el endpoint que controla el estado de suscripción (acceso pago) abierto a
    // spoofing. MP_WEBHOOK_SECRET es obligatorio en prod.
    console.error('MP_WEBHOOK_SECRET no configurado: se rechazan los webhooks de Mercado Pago');
    return false;
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

  let manifest = `id:${signedId.toLowerCase()};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  const computed = createHmac('sha256', secret).update(manifest).digest('hex');
  return timingSafeStringEqual(computed, v1);
}

function normalizeResourceId(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const id = String(value).trim().toLowerCase();
  return id || null;
}

/** Bind every resource lookup to the query ID included in the HMAC manifest. */
function signedResourceId(req: NextRequest): string | null {
  const query = req.nextUrl.searchParams;
  const candidates = query.getAll('data.id');
  const legacy = query.getAll('id');
  const signedId = normalizeResourceId(candidates[0] ?? legacy[0]);
  if (!signedId) return null;
  const aliases = [...candidates, ...legacy, ...query.getAll('preapproval_id')];
  if (aliases.some(value => normalizeResourceId(value) !== signedId)) return null;
  return signedId;
}

function hasMatchingBodyResource(payload: unknown, signedId: string): boolean {
  if (!payload || typeof payload !== 'object') return true;
  const body = payload as { id?: unknown; data?: { id?: unknown } | null; resource?: unknown };
  const dataId = body.data?.id;
  if (dataId !== undefined && normalizeResourceId(dataId) !== signedId) return false;
  // In the modern format, body.id identifies the notification, not the resource.
  // Only the legacy body without data.id treated top-level id as a resource alias.
  if (dataId === undefined && body.id !== undefined && normalizeResourceId(body.id) !== signedId) return false;
  if (typeof body.resource === 'string') {
    const match = body.resource.match(/\/(?:preapproval|authorized_payments)\/([^/?#]+)/i);
    if (match?.[1]) {
      try {
        if (normalizeResourceId(decodeURIComponent(match[1])) !== signedId) return false;
      } catch {
        return false;
      }
    }
  }
  return true;
}

function notificationType(req: NextRequest, payload?: unknown): string | null {
  const body = payload && typeof payload === 'object' ? payload as { type?: unknown; topic?: unknown } : {};
  const aliases = [...req.nextUrl.searchParams.getAll('type'), ...req.nextUrl.searchParams.getAll('topic'), body.type, body.topic]
    .filter(value => value !== undefined && value !== null);
  if (aliases.some(value => typeof value !== 'string') || new Set(aliases).size > 1) return null;
  return aliases.length ? String(aliases[0]) : 'subscription_preapproval';
}

async function processWebhook(resourceId: string, type: string): Promise<void> {
  return observedStep({ component: 'service', action: 'execute', failureClass: 'consistency' }, async () => {
  if (!['subscription_preapproval', 'preapproval', 'subscription_authorized_payment'].includes(type)) return;
  let invoice = type === 'subscription_authorized_payment'
    ? await observedStep({ component: 'provider', action: 'lookup', failureClass: 'provider' },
      () => mercadoPagoService.getAuthorizedPayment(resourceId)) : null;
  if (invoice && String(invoice.id) !== resourceId) throw new Error('Mercado Pago invoice resource mismatch');
  const preapprovalId = invoice ? invoice.preapproval_id : resourceId;
  if (!preapprovalId) throw new Error('Mercado Pago invoice has no subscription');
  // Checkout persists this association before exposing a payment link. Never let
  // external_reference attach an unrelated or retired agreement to a user.
  const supabase = createServiceClientSync();
  const owner = await observedStep({ component: 'database', action: 'lookup', failureClass: 'consistency' }, async () => {
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('mp_preapproval_id', preapprovalId)
    .maybeSingle();
  if (error) throw error;
  return data;
  });
  if (!owner) return;

  // Read the snapshot BEFORE fetching provider state. A concurrent checkout or
  // newer webhook must make the conditional write fail and trigger a retry.
  const currentState = await subscriptionsService.getUserState(owner.id);
  if (!currentState || currentState.mp_preapproval_id !== preapprovalId) return;
  if (invoice) {
    invoice = await observedStep({ component: 'provider', action: 'lookup', failureClass: 'provider' },
      () => mercadoPagoService.getAuthorizedPayment(resourceId));
    if (String(invoice.id) !== resourceId || invoice.preapproval_id !== preapprovalId) {
      throw new Error('Mercado Pago invoice association changed');
    }
  }
  const preapproval = await observedStep({ component: 'provider', action: 'lookup', failureClass: 'provider' },
    () => mercadoPagoService.getPreapproval(preapprovalId));
  if (preapproval.id !== preapprovalId || preapproval.external_reference !== owner.id ||
      (invoice && invoice.external_reference !== owner.id)) {
    throw new Error('Mercado Pago subscription association mismatch');
  }
  const nextState = invoice ? mapAuthorizedPayment(invoice, preapproval, currentState)
    : mercadoPagoService.mapPreapprovalStatusToSubscription(preapproval, currentState.status);
  if (!nextState) return;
  if (nextState.status === currentState.status &&
      (nextState.currentPeriodEnd === undefined || nextState.currentPeriodEnd === currentState.current_period_end) &&
      (nextState.gracePeriodEnd === undefined || nextState.gracePeriodEnd === currentState.grace_period_end)) return;

  await observedStep({ component: 'database', action: 'persist', failureClass: 'consistency',
    referenceType: 'user' }, () => subscriptionsService.updateUserState({
    userId: owner.id,
    status: nextState.status,
    currentPeriodEnd: nextState.currentPeriodEnd,
    gracePeriodEnd: nextState.gracePeriodEnd,
    mpPreapprovalId: preapproval.id,
    expectedState: currentState,
  }), () => owner.id);
  });
}

export async function POST(req: NextRequest) {
  return observedRequest(req, 'payment', 'payment.webhook', async () => {
  const signedId = signedResourceId(req);
  if (!signedId || !verifyMercadoPagoSignature(req, signedId)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  const payload = await req.json().catch(() => null);
  if (!hasMatchingBodyResource(payload, signedId)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  const type = notificationType(req, payload);
  if (!type) return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
  try {
    await processWebhook(signedId, type);
  } catch (error) {
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
  });
}

export async function GET(req: NextRequest) {
  return observedRequest(req, 'payment', 'payment.webhook', async () => {
  // MP también notifica por GET; debe validar firma igual que POST. Sin esto, un
  // GET sin firma podía forzar transiciones de suscripción de cualquier usuario.
  const signedId = signedResourceId(req);
  if (!signedId || !verifyMercadoPagoSignature(req, signedId)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  const type = notificationType(req);
  if (!type) return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 });
  try {
    await processWebhook(signedId, type);
  } catch (error) {
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
  });
}
