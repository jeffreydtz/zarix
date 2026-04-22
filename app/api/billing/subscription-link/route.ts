import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mercadoPagoService } from '@/lib/services/mercado-pago-service';
import { subscriptionsService } from '@/lib/services/subscriptions';
import { getBillingPlanById, getBillingPlans } from '@/lib/billing/plans';

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

    const body = (await req.json().catch(() => ({}))) as {
      plan_id?: string;
      back_url?: string;
    };

    const plans = getBillingPlans();
    const selectedPlan =
      (body.plan_id && getBillingPlanById(body.plan_id)) || plans[0] || null;

    if (!selectedPlan) {
      return NextResponse.json({ error: 'No billing plans configured' }, { status: 500 });
    }

    const backUrl =
      body.back_url || process.env.MP_SUBSCRIPTION_BACK_URL || `${req.nextUrl.origin}/settings`;

    const preapproval = await mercadoPagoService.createPreapproval({
      userId: user.id,
      payerEmail: user.email,
      reason: selectedPlan.reason,
      backUrl,
      transactionAmount: selectedPlan.amount,
      currencyId: selectedPlan.currency,
    });

    if (!preapproval.id || !preapproval.init_point) {
      return NextResponse.json(
        { error: 'Mercado Pago did not return init_point' },
        { status: 502 }
      );
    }

    const currentState = await subscriptionsService.getUserState(user.id);
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
