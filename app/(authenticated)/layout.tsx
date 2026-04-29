import { createClient } from '@/lib/supabase/server';
import { getCachedUser } from '@/lib/auth/session';
import Navigation from '@/components/Navigation';
import OfflineReferenceWarmup from '@/components/OfflineReferenceWarmup';

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCachedUser();
  const supabase = await createClient();

  let gracePeriodEnd: string | null = null;
  if (user) {
    const { data } = await supabase
      .from('users')
      .select('status, grace_period_end')
      .eq('id', user.id)
      .maybeSingle();
    if (data?.status === 'GRACE_PERIOD') {
      gracePeriodEnd = data.grace_period_end;
    }
  }

  return (
    <div className="flex flex-col h-dvh max-h-dvh min-h-0 overflow-hidden md:h-auto md:max-h-none md:min-h-dvh md:overflow-visible">
      <OfflineReferenceWarmup />
      {gracePeriodEnd && (
        <div className="bg-amber-100 border-b border-amber-300 text-amber-900 dark:bg-amber-950/60 dark:border-amber-800 dark:text-amber-200 px-4 py-2 text-sm">
          Tu ultimo cobro fallo y estas en periodo de gracia hasta{' '}
          <strong>{new Date(gracePeriodEnd).toLocaleString('es-AR')}</strong>. Actualiza el pago para
          evitar interrupciones del orquestador de IA.
        </div>
      )}
      <Navigation>{children}</Navigation>
    </div>
  );
}
