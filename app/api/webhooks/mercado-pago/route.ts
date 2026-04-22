import { NextRequest, NextResponse } from 'next/server';
import { createServiceClientSync } from '@/lib/supabase/server';
import { mercadoPagoService } from '@/lib/services/mercado-pago-service';
import { subscriptionsService } from '@/lib/services/subscriptions';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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
