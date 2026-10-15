'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  PasswordRecoveryError,
  requestPasswordRecovery,
  updateRecoveredPassword,
} from '@/lib/auth/password-recovery';

interface Props {
  mode: 'request' | 'update';
  invalidLink?: boolean;
  expectedUserId?: string;
}

export default function PasswordRecoveryForm({ mode, invalidLink = false, expectedUserId }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<PasswordRecoveryError | null>(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const submitting = useRef(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError(null);
    setMessage('');
    try {
      const client = createClient();
      if (mode === 'request') {
        setMessage(await requestPasswordRecovery(client.auth, email, window.location.origin));
      } else {
        await updateRecoveredPassword(client.auth, password, confirmation, expectedUserId);
        setPassword('');
        setConfirmation('');
        setMessage('Tu contraseña se actualizó.');
      }
    } catch (cause) {
      setError(cause instanceof PasswordRecoveryError ? cause : new PasswordRecoveryError(
        mode === 'request' ? 'email' : 'password', 'No pudimos completar la solicitud. Volvé a intentar.'
      ));
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  };

  const fieldError = (field: PasswordRecoveryError['field']) => error?.field === field ? (
    <p id={`recovery-${field}-error`} role="alert" className="mt-2 text-sm text-destructive">{error.message}</p>
  ) : null;

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background px-4 py-8">
      <section className="w-full max-w-md rounded-3xl border border-border bg-card p-5 sm:p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-foreground">
          {mode === 'request' ? 'Recuperar contraseña' : 'Nueva contraseña'}
        </h1>
        {invalidLink ? <p role="alert" className="mt-3 text-sm text-destructive">El enlace no es válido o venció. Solicitá uno nuevo.</p> : null}
        {message ? (
          <div className="mt-4 space-y-4">
            <p role="status" className="text-sm text-foreground">{message}</p>
            <Link href={mode === 'update' ? '/dashboard' : '/login'} className="btn btn-primary inline-flex">
              {mode === 'update' ? 'Continuar' : 'Volver a iniciar sesión'}
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            {mode === 'request' ? (
              <div>
                <label htmlFor="recovery-email" className="mb-2 block text-sm font-medium text-foreground">Email</label>
                <input id="recovery-email" type="email" autoComplete="email" required value={email}
                  onChange={event => setEmail(event.target.value)} disabled={loading} className="input"
                  aria-invalid={error?.field === 'email'}
                  aria-describedby={error?.field === 'email' ? 'recovery-email-help recovery-email-error' : 'recovery-email-help'} />
                <p id="recovery-email-help" className="mt-2 text-xs text-muted-foreground">Abrí el enlace en este mismo navegador para completar la recuperación.</p>
                {fieldError('email')}
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="recovery-password" className="mb-2 block text-sm font-medium text-foreground">Nueva contraseña</label>
                  <input id="recovery-password" type="password" autoComplete="new-password" minLength={6} required
                    value={password} onChange={event => setPassword(event.target.value)} disabled={loading} className="input"
                    aria-invalid={error?.field === 'password'}
                    aria-describedby={error?.field === 'password' ? 'recovery-password-help recovery-password-error' : 'recovery-password-help'} />
                  <p id="recovery-password-help" className="mt-2 text-xs text-muted-foreground">Al menos 6 caracteres.</p>
                  {fieldError('password')}
                </div>
                <div>
                  <label htmlFor="recovery-confirmation" className="mb-2 block text-sm font-medium text-foreground">Confirmar contraseña</label>
                  <input id="recovery-confirmation" type="password" autoComplete="new-password" minLength={6} required
                    value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={loading} className="input"
                    aria-invalid={error?.field === 'confirmation'}
                    aria-describedby={error?.field === 'confirmation' ? 'recovery-confirmation-error' : undefined} />
                  {fieldError('confirmation')}
                </div>
              </>
            )}
            <button type="submit" disabled={loading} className="btn btn-primary w-full">
              {loading ? 'Procesando…' : mode === 'request' ? 'Enviar enlace de recuperación' : 'Guardar nueva contraseña'}
            </button>
          </form>
        )}
        {!message ? <Link href="/login" className="mt-5 inline-block text-sm text-primary underline">Volver a iniciar sesión</Link> : null}
      </section>
    </main>
  );
}
