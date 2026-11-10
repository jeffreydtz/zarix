import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import IntegrationsPanel from '@/components/settings/IntegrationsPanel';
import StatementIngestPanel from '@/components/settings/StatementIngestPanel';
import InboundEmailPanel from '@/components/settings/InboundEmailPanel';

export default async function IntegracionesPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) redirect('/login');

  const { data: user } = await supabase
    .from('users')
    .select('wallet_auto_confirm')
    .eq('id', authUser.id)
    .maybeSingle();

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || '';

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-6">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link href="/settings" className="hover:text-foreground">
              Configuración
            </Link>{' '}
            / Integraciones
          </p>
          <h1 className="mt-1 text-3xl font-bold text-foreground">Integraciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tokens, atajos de Wallet, resúmenes PDF/CSV, mail inbound y registro de actividad. Documentación pública en{' '}
            <Link href="/docs" className="text-primary">
              /docs
            </Link>
            .
          </p>
        </div>
        <StatementIngestPanel />
        <InboundEmailPanel />
        <IntegrationsPanel appBaseUrl={appBaseUrl} autoConfirm={Boolean(user?.wallet_auto_confirm)} />
      </div>
    </div>
  );
}
