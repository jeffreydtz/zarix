import Link from 'next/link';
import PasswordRecoveryForm from '@/components/auth/PasswordRecoveryForm';
import { createClient } from '@/lib/supabase/server';
import { isRejectedSessionError } from '@/lib/auth/session-error';

export const dynamic = 'force-dynamic';

export default async function UpdatePasswordPage() {
  let ownerId: string | null = null;
  let unavailable = false;
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    ownerId = user && !error ? user.id : null;
    unavailable = Boolean(error && !isRejectedSessionError(error));
  } catch {
    unavailable = true;
  }
  if (ownerId) return <PasswordRecoveryForm mode="update" expectedUserId={ownerId} />;
  return (
    <main className="min-h-dvh flex items-center justify-center bg-background px-4 py-8">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-5 sm:p-8">
        <h1 className="text-2xl font-bold text-foreground">Nueva contraseña</h1>
        <p role="alert" className="mt-4 text-sm text-foreground">
          {unavailable ? 'No pudimos verificar tu sesión. Volvé a intentar en unos minutos.' : 'El enlace no es válido o venció. Solicitá uno nuevo.'}
        </p>
        <Link href={unavailable ? '/auth/update-password' : '/auth/forgot-password'} className="btn btn-primary mt-5 inline-flex">
          {unavailable ? 'Reintentar' : 'Solicitar otro enlace'}
        </Link>
      </section>
    </main>
  );
}
