import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mercadoPagoService } from '@/lib/services/mercado-pago-service';
import { subscriptionsService } from '@/lib/services/subscriptions';
import { getBillingPlanById, getBillingPlans } from '@/lib/billing/plans';
import { matchesBillingPlan } from '@/lib/billing/subscription-events';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ plans: getBillingPlans() });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user.email) {
      return NextResponse.json(
        { error: 'User email is required to create subscription link' },
        { status: 400 }
      );
    }

    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        ('plan_id' in body && typeof body.plan_id !== 'string') ||
        ('back_url' in body && typeof body.back_url !== 'string')) {
      return NextResponse.json({ error: 'Datos de suscripción inválidos.' }, { status: 400 });
    }
    const input = body as { plan_id?: string; back_url?: string };

    const plans = getBillingPlans();
    if (input.plan_id !== undefined && !getBillingPlanById(input.plan_id)) {
      return NextResponse.json({ error: 'El plan seleccionado no existe.' }, { status: 400 });
    }
    const selectedPlan = input.plan_id ? getBillingPlanById(input.plan_id) : plans[0] || null;

    if (!selectedPlan) {
      return NextResponse.json({ error: 'No hay planes de cobro configurados.' }, { status: 503 });
    }

    // Solo aceptamos back_url propio (mismo origen): un back_url arbitrario del
    // body sería una superficie de open-redirect al volver de Mercado Pago.
    const safeBackUrl = (() => {
      if (!input.back_url) return null;
      try {
        const u = new URL(input.back_url, req.nextUrl.origin);
        return u.origin === req.nextUrl.origin ? u.toString() : null;
      } catch {
        return null;
      }
    })();
    const backUrl =
      safeBackUrl || process.env.MP_SUBSCRIPTION_BACK_URL || `${req.nextUrl.origin}/settings`;

    const currentState = await subscriptionsService.getUserState(user.id);
    if (!currentState) return NextResponse.json({ error: 'Usuario no encontrado.' }, { status: 404 });
    if (currentState.mp_preapproval_id) {
      const existing = await mercadoPagoService.getPreapproval(currentState.mp_preapproval_id);
      if (existing.id !== currentState.mp_preapproval_id || existing.external_reference !== user.id) {
        return NextResponse.json({ error: 'No se pudo verificar la suscripción.' }, { status: 502 });
      }
      if (existing.status === 'pending' && matchesBillingPlan(existing, selectedPlan) && existing.init_point) {
        return NextResponse.json({ init_point: existing.init_point, preapproval_id: existing.id, status: currentState.status, plan: selectedPlan });
      }
      if (!['cancelled', 'canceled'].includes(existing.status)) {
        return NextResponse.json({ error: 'Ya tenés una suscripción en curso. Cancelala antes de crear otra.' }, { status: 409 });
      }
    }
    const preapproval = await mercadoPagoService.createPreapproval({
      userId: user.id,
      payerEmail: user.email,
      reason: selectedPlan.reason,
      backUrl,
      transactionAmount: selectedPlan.amount,
      currencyId: selectedPlan.currency,
      frequency: selectedPlan.interval === 'yearly' ? 12 : 1,
      frequencyType: 'months',
    });

    if (!preapproval.id || !preapproval.init_point || preapproval.external_reference !== user.id ||
        !matchesBillingPlan(preapproval, selectedPlan)) {
      return NextResponse.json(
        { error: 'Mercado Pago devolvió una suscripción inválida.' },
        { status: 502 }
      );
    }

    const currentStatus = currentState?.status || 'PAST_DUE';
    const nextState = mercadoPagoService.mapPreapprovalStatusToSubscription(
      preapproval,
      currentStatus
    );

    await subscriptionsService.updateUserState({
      userId: user.id,
      status: nextState.status,
      currentPeriodEnd: nextState.currentPeriodEnd,
      gracePeriodEnd: nextState.gracePeriodEnd,
      mpPreapprovalId: preapproval.id,
      expectedState: currentState,
    });

    return NextResponse.json({
      init_point: preapproval.init_point,
      preapproval_id: preapproval.id,
      status: nextState.status,
      plan: selectedPlan,
    });
  } catch (error) {
    console.error('subscription-link error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
