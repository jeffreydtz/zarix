import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { subscriptionsService } from '@/lib/services/subscriptions';
import { mercadoPagoService } from '@/lib/services/mercado-pago-service';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    const current = await subscriptionsService.getUserState(user.id);
    if (!current?.mp_preapproval_id) {
      return NextResponse.json({ error: 'No tenés una suscripción asociada.' }, { status: 404 });
    }
    let preapproval = await mercadoPagoService.getPreapproval(current.mp_preapproval_id);
    if (preapproval.id !== current.mp_preapproval_id || preapproval.external_reference !== user.id) {
      return NextResponse.json({ error: 'No se pudo verificar la suscripción.' }, { status: 502 });
    }
    if (!['cancelled', 'canceled'].includes(preapproval.status)) {
      preapproval = await mercadoPagoService.cancelPreapproval(current.mp_preapproval_id);
    }
    if (preapproval.id !== current.mp_preapproval_id || preapproval.external_reference !== user.id ||
        !['cancelled', 'canceled'].includes(preapproval.status)) {
      return NextResponse.json({ error: 'Mercado Pago no confirmó la cancelación.' }, { status: 502 });
    }
    if (current.status !== 'CANCELED' || current.grace_period_end) {
      await subscriptionsService.updateUserState({
        userId: user.id, status: 'CANCELED', gracePeriodEnd: null, expectedState: current,
      });
    }
    // Cancellation stops renewal; verified paid-through time is not shortened.
    return NextResponse.json({ status: 'CANCELED', current_period_end: current.current_period_end });
  } catch (error) {
    console.error('subscription cancellation error:', error);
    return NextResponse.json({ error: 'No se pudo cancelar la suscripción.' }, { status: 500 });
  }
}
