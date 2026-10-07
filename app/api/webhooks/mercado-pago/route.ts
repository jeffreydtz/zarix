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
    const match = body.resource.match(/\/preapproval\/([^/?#]+)/i);
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

async function processWebhook(preapprovalId: string): Promise<void> {
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
  const signedId = signedResourceId(req);
  if (!signedId || !verifyMercadoPagoSignature(req, signedId)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  const payload = await req.json().catch(() => null);
  if (!hasMatchingBodyResource(payload, signedId)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  try {
    await processWebhook(signedId);
  } catch (error) {
    console.error('Mercado Pago webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  // MP también notifica por GET; debe validar firma igual que POST. Sin esto, un
  // GET sin firma podía forzar transiciones de suscripción de cualquier usuario.
  const signedId = signedResourceId(req);
  if (!signedId || !verifyMercadoPagoSignature(req, signedId)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }
  try {
    await processWebhook(signedId);
  } catch (error) {
    console.error('Mercado Pago webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
