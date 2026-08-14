import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/auth/session';

/**
 * Banner de período de gracia (cobro fallido). Vive detrás de <Suspense>
 * para que sus llamadas a Supabase (usuario + estado de cobro) no bloqueen
 * el primer paint del shell autenticado: el layout queda síncrono y el
 * banner aparece cuando la data llega.
 */
export default async function GracePeriodBanner() {
  const user = await getCachedUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from('users')
    .select('status, grace_period_end')
    .eq('id', user.id)
    .maybeSingle();

  if (data?.status !== 'GRACE_PERIOD' || !data.grace_period_end) return null;

  return (
    <div className="bg-warning/20 border-b border-warning/30 text-warning px-4 py-2.5 text-sm backdrop-blur-md">
      Tu último cobro falló y estás en período de gracia hasta{' '}
      <strong>{new Date(data.grace_period_end).toLocaleString('es-AR')}</strong>. Actualizá el pago
      para evitar interrupciones del orquestador de IA.
    </div>
  );
}
