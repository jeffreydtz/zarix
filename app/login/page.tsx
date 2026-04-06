'use client';

import { Suspense, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showResendConfirmation, setShowResendConfirmation] = useState(false);
  const [mode, setMode] = useState<'magiclink' | 'password'>('password');
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.push('/dashboard');
      }
    });

    const error = searchParams.get('error');
    if (error) {
      setMessage(`Error: ${decodeURIComponent(error)}`);
    }

    if (searchParams.get('registered') === '1') {
      setMessage(
        'success:Te enviamos un correo para confirmar tu cuenta. Revisá tu bandeja (y spam).'
      );
    }
  }, [router, searchParams]);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    setShowResendConfirmation(false);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        const code = (error as { code?: string }).code;
        const msg = error.message.toLowerCase();
        if (
          code === 'email_not_confirmed' ||
          msg.includes('email not confirmed')
        ) {
          setShowResendConfirmation(true);
        }
        throw error;
      }

      router.push('/dashboard');
    } catch (error: unknown) {
      const err = error as { message?: string };
      setMessage(`Error: ${err.message ?? 'Error al iniciar sesión'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleResendConfirmation = async () => {
    if (!email.trim()) {
      setMessage('Error: Ingresá tu email arriba para reenviar la confirmación.');
      return;
    }
    setResendLoading(true);
    setMessage('');
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      setMessage('success:Te reenviamos el correo de confirmación.');
    } catch (error: unknown) {
      const err = error as { message?: string };
      setMessage(`Error: ${err.message ?? 'No se pudo reenviar'}`);
    } finally {
      setResendLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

      setMessage('success:Te enviamos un link a tu email. Revisá tu casilla.');
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isError = message.startsWith('Error:');
  const isSuccess = message.startsWith('success:');
  const displayMessage = message.replace('success:', '').replace('Error: ', '');

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-8 w-full max-w-md border border-slate-200 dark:border-slate-700"
      >
        <motion.div 
          className="text-center mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <motion.div
            animate={{ rotate: [0, -5, 5, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            className="text-6xl mb-4"
          >
            💰
          </motion.div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
            Zarix
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Tus finanzas personales en un solo lugar
          </p>
        </motion.div>

        <div className="flex gap-2 mb-6 p-1 bg-slate-100 dark:bg-slate-700 rounded-xl">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setMode('password')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'password'
                ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
            }`}
          >
            Contrasena
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setMode('magiclink')}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all ${
              mode === 'magiclink'
                ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
            }`}
          >
            Magic Link
          </motion.button>
        </div>

        <form onSubmit={mode === 'password' ? handlePasswordLogin : handleMagicLink} className="space-y-4">
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              className="input"
            />
          </motion.div>

          <AnimatePresence mode="wait">
            {mode === 'password' && (
              <motion.div
                key="password-field"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Contrasena
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimo 6 caracteres"
                  required
                  className="input"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            disabled={loading}
            whileTap={{ scale: 0.97 }}
            className="w-full btn btn-primary py-3.5 text-lg mt-2"
          >
            {loading ? (
              <motion.span
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                Cargando...
              </motion.span>
            ) : mode === 'password' ? (
              'Ingresar'
            ) : (
              'Enviar link'
            )}
          </motion.button>
        </form>

        <AnimatePresence mode="wait">
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className={`mt-4 p-4 rounded-xl text-sm font-medium ${
                isSuccess
                  ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800'
              }`}
            >
              <span className="mr-2">{isSuccess ? '✓' : '!'}</span>
              {displayMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {mode === 'password' && showResendConfirmation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 text-center"
          >
            <button
              type="button"
              onClick={handleResendConfirmation}
              disabled={resendLoading}
              className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
            >
              {resendLoading ? 'Enviando…' : 'Reenviar correo de confirmación'}
            </button>
          </motion.div>
        )}

        <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
          ¿No tenés cuenta?{' '}
          <Link
            href="/register"
            className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            Registrate
          </Link>
        </p>

        <motion.div 
          className="mt-8 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-lg">🇦🇷</span>
            <span>Optimizado para Argentina</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <span>Blue</span>
            <span className="text-slate-300">•</span>
            <span>MEP</span>
            <span className="text-slate-300">•</span>
            <span>CCL</span>
            <span className="text-slate-300">•</span>
            <span>Crypto</span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700">
        <motion.div
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-6xl"
        >
          💰
        </motion.div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
