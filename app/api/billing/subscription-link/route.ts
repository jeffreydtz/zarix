import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mercadoPagoService } from '@/lib/services/mercado-pago-service';
import { subscriptionsService } from '@/lib/services/subscriptions';

export const dynamic = 'force-dynamic';

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
      reason?: string;
      transaction_amount?: number;
      currency_id?: string;
      back_url?: string;
    };

    const reason = body.reason || process.env.MP_SUBSCRIPTION_REASON || 'Zarix SaaS';
    const transactionAmount = Number(
      body.transaction_amount ?? process.env.MP_SUBSCRIPTION_AMOUNT ?? 0
    );
    const currencyId = body.currency_id || process.env.MP_SUBSCRIPTION_CURRENCY || 'ARS';
    const backUrl =
      body.back_url || process.env.MP_SUBSCRIPTION_BACK_URL || `${req.nextUrl.origin}/settings`;

    if (!Number.isFinite(transactionAmount) || transactionAmount <= 0) {
      return NextResponse.json(
        { error: 'Invalid transaction amount for subscription' },
        { status: 400 }
      );
    }

    const preapproval = await mercadoPagoService.createPreapproval({
      userId: user.id,
      payerEmail: user.email,
      reason,
      backUrl,
      transactionAmount,
      currencyId,
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
    });
  } catch (error) {
    console.error('subscription-link error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
