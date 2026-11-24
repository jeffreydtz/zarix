import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { USER_CLIENT_SAFE_COLUMNS } from '@/lib/constants/user-columns';
import BugReportWidget from '@/components/BugReportWidget';
import SettingsForm from '@/components/settings/SettingsForm';
import type { User } from '@/types/database';
import PasskeysSection from '@/components/settings/PasskeysSection';
import ExportImport from '@/components/settings/ExportImport';
import BenchmarkSettingsForm from '@/components/settings/BenchmarkSettingsForm';
import LogoutButton from '@/components/settings/LogoutButton';
import ReplayTourButton from '@/components/onboarding/ReplayTourButton';

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    redirect('/login');
  }

  const { data: userRow } = await supabase
    .from('users')
    .select(USER_CLIENT_SAFE_COLUMNS)
    .eq('id', authUser.id)
    .single();
  // El select con proyección segura devuelve un subconjunto de columnas; el
  // cliente nunca lee los secretos (revocados a nivel columna).
  const user = userRow as unknown as User | null;

  // Los secretos (gemini_api_key, telegram_bot_token) están revocados para el rol
  // authenticated. Solo necesitamos saber si están configurados, no su valor:
  // lo resolvemos server-side con el service client.
  const { getUserGeminiApiKey, getUserTelegramBotToken } = await import('@/lib/secrets/user-secrets');
  const [geminiKey, telegramToken] = await Promise.all([
    getUserGeminiApiKey(authUser.id),
    getUserTelegramBotToken(authUser.id),
  ]);
  const secretsState = { gemini_api_key: geminiKey, telegram_bot_token: telegramToken };

  const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || '';

  return (
    <div className="min-h-screen bg-background transition-colors duration-300">
      <div className="max-w-4xl mx-auto px-4 py-6 pb-8 md:pb-10 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Configuración</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Personalizá tu experiencia en Zarix
          </p>
          <p className="mt-2 text-sm">
            <Link href="/settings/integraciones" className="text-primary">
              Integraciones
            </Link>
            {' · '}
            <Link href="/pendientes" className="text-primary">
              Bandeja de pendientes
            </Link>
            {' · '}
            <Link href="/docs" className="text-primary">
              Documentación
            </Link>
          </p>
        </div>

        {user && (
          <SettingsForm
            key={user.id}
            user={user}
            geminiConfigured={!!secretsState?.gemini_api_key}
            telegramCustomMode={!!secretsState?.telegram_bot_token}
            webhookSecret={user.telegram_webhook_secret}
            appBaseUrl={appBaseUrl}
          />
        )}

        <BenchmarkSettingsForm />

        <PasskeysSection />

        <ExportImport />

        <ReplayTourButton />

        <LogoutButton />
      </div>

      <BugReportWidget />
    </div>
  );
}
