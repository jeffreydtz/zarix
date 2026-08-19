'use client';

import { useState, useEffect } from 'react';
import type { User } from '@/types/database';
import { useRouter } from 'next/navigation';

interface SettingsFormProps {
  user: User;
  geminiConfigured: boolean;
  telegramCustomMode: boolean;
  webhookSecret: string | null;
  appBaseUrl: string;
}

interface BillingPlan {
  id: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  interval: 'monthly' | 'yearly';
}

export default function SettingsForm({
  user,
  geminiConfigured,
  telegramCustomMode,
  webhookSecret,
  appBaseUrl,
}: SettingsFormProps) {
  const router = useRouter();
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const [geminiKey, setGeminiKey] = useState('');
  const [integLoading, setIntegLoading] = useState(false);
  const [integMessage, setIntegMessage] = useState('');
  const [telegramMode, setTelegramMode] = useState<'shared' | 'custom'>(
    telegramCustomMode ? 'custom' : 'shared'
  );
  const [customBotToken, setCustomBotToken] = useState('');
  const [lastWebhookUrl, setLastWebhookUrl] = useState<string | null>(null);
  const [lastWebhookSecretToken, setLastWebhookSecretToken] = useState<string | null>(null);

  const [weeklySummary, setWeeklySummary] = useState(user.weekly_summary_enabled);
  const [monthlySummary, setMonthlySummary] = useState(user.monthly_summary_enabled);
  const [nextWeeklyLabel, setNextWeeklyLabel] = useState<string | null>(null);
  const [nextMonthlyLabel, setNextMonthlyLabel] = useState<string | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState(user.status);
  const [gracePeriodEnd, setGracePeriodEnd] = useState<string | null>(
    user.grace_period_end
  );
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingPlans, setBillingPlans] = useState<BillingPlan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState('');

  useEffect(() => {
    fetch('/api/user/notification-preferences')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.weekly_summary_enabled === 'boolean') {
          setWeeklySummary(d.weekly_summary_enabled);
        }
        if (typeof d.monthly_summary_enabled === 'boolean') {
          setMonthlySummary(d.monthly_summary_enabled);
        }
        if (d.next_weekly_label) setNextWeeklyLabel(d.next_weekly_label);
        if (d.next_monthly_label) setNextMonthlyLabel(d.next_monthly_label);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/billing/subscription-link')
      .then((r) => r.json())
      .then((d) => {
        const plans = Array.isArray(d?.plans) ? (d.plans as BillingPlan[]) : [];
        setBillingPlans(plans);
        if (plans.length > 0) {
          setSelectedPlanId(plans[0].id);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/user/subscription')
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.status === 'string') {
          setSubscriptionStatus(d.status);
        }
        if (typeof d?.grace_period_end === 'string' || d?.grace_period_end === null) {
          setGracePeriodEnd(d.grace_period_end ?? null);
        }
      })
      .catch(() => {});
  }, []);

  const isPastDue = subscriptionStatus === 'PAST_DUE' || subscriptionStatus === 'CANCELED';
  const isGracePeriod = subscriptionStatus === 'GRACE_PERIOD';
  const isActivePlan = subscriptionStatus === 'ACTIVE';

  const subscriptionStatusLabel: Record<string, string> = {
    ACTIVE: 'Activa',
    GRACE_PERIOD: 'Periodo de gracia',
    PAST_DUE: 'Pago pendiente',
    CANCELED: 'Cancelada',
  };

  const startCheckout = async () => {
    setBillingLoading(true);
    setIntegMessage('');
    try {
      const res = await fetch('/api/billing/subscription-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: selectedPlanId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.init_point) {
        throw new Error(data.error || 'No se pudo iniciar el checkout');
      }
      window.location.href = data.init_point as string;
    } catch (error: unknown) {
      const err = error as { message?: string };
      setIntegMessage(`❌ ${err.message || 'No se pudo iniciar el checkout'}`);
    } finally {
      setBillingLoading(false);
    }
  };

  const saveNotificationToggle = async (
    field: 'weekly_summary_enabled' | 'monthly_summary_enabled',
    value: boolean
  ) => {
    setNotifLoading(true);
    try {
      const res = await fetch('/api/user/notification-preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      if (typeof data.weekly_summary_enabled === 'boolean') {
        setWeeklySummary(data.weekly_summary_enabled);
      }
      if (typeof data.monthly_summary_enabled === 'boolean') {
        setMonthlySummary(data.monthly_summary_enabled);
      }
      if (data.next_weekly_label !== undefined) {
        setNextWeeklyLabel(data.next_weekly_label);
      }
      if (data.next_monthly_label !== undefined) {
        setNextMonthlyLabel(data.next_monthly_label);
      }
    } catch {
      setIntegMessage('❌ No se pudieron guardar las notificaciones.');
    } finally {
      setNotifLoading(false);
    }
  };

  const webhookUrl =
    lastWebhookUrl ||
    (webhookSecret && appBaseUrl
      ? `${appBaseUrl}/api/telegram/webhook/u/${webhookSecret}`
      : null);

  const handleGenerateLinkCode = async () => {
    setLoading(true);
    setMessage('');
    setLinkCode(null);

    try {
      const response = await fetch('/api/auth/telegram-link-code', {
        method: 'POST',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo generar el código');
      }
      setLinkCode(data.code);
      setMessage('✅ Código generado. Enviámelo al bot en los próximos 10 minutos.');
    } catch (error: unknown) {
      const err = error as { message?: string };
      setMessage(`❌ ${err.message || 'No se pudo generar el código'}`);
    } finally {
      setLoading(false);
    }
  };

  const saveGeminiOnly = async () => {
    if (!geminiKey.trim()) {
      setIntegMessage('❌ Pegá una API key o usá "Quitar mi clave".');
      return;
    }
    setIntegLoading(true);
    setIntegMessage('');
    try {
      const response = await fetch('/api/user/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini_api_key: geminiKey.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar');
      setIntegMessage('✅ API Key de Gemini guardada.');
      setGeminiKey('');
      setTimeout(() => router.refresh(), 1500);
    } catch (error: unknown) {
      const err = error as { message?: string };
      setIntegMessage(`❌ ${err.message || 'Error'}`);
    } finally {
      setIntegLoading(false);
    }
  };

  const saveTelegramOnly = async () => {
    setIntegLoading(true);
    setIntegMessage('');
    try {
      const body: Record<string, unknown> =
        telegramMode === 'shared'
          ? { telegram_mode: 'shared' }
          : {
              telegram_mode: 'custom',
              telegram_bot_token: customBotToken.trim() || undefined,
            };

      const response = await fetch('/api/user/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar');
      if (data.webhookUrl) setLastWebhookUrl(data.webhookUrl);
      if (data.webhookSecretToken) setLastWebhookSecretToken(data.webhookSecretToken);
      setIntegMessage('✅ Configuración de Telegram guardada. Si usás bot propio, configurá el webhook con curl.');
      setCustomBotToken('');
      setTimeout(() => router.refresh(), 2000);
    } catch (error: unknown) {
      const err = error as { message?: string };
      setIntegMessage(`❌ ${err.message || 'Error'}`);
    } finally {
      setIntegLoading(false);
    }
  };

  const clearGeminiKey = async () => {
    setIntegLoading(true);
    setIntegMessage('');
    try {
      const response = await fetch('/api/user/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gemini_api_key: null }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Error');
      setIntegMessage('✅ Clave de Gemini eliminada (se usará la del servidor si existe).');
      setTimeout(() => router.refresh(), 1500);
    } catch (error: unknown) {
      const err = error as { message?: string };
      setIntegMessage(`❌ ${err.message || 'Error'}`);
    } finally {
      setIntegLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Cuenta</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground">User ID</label>
            <div className="font-mono text-sm bg-secondary p-2 rounded">
              {user.id}
            </div>
          </div>
        </div>
      </div>

      {integMessage && (
        <div
          className={`p-4 rounded-xl text-sm ${
            integMessage.startsWith('✅')
              ? 'bg-success/10 text-success'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          {integMessage}
        </div>
      )}

      <div className="card border-2 border-accent-invest/30">
        <h2 className="text-xl font-semibold mb-2">Plan y suscripción</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Estado de la pasarela de pagos y selección del plan a contratar.
        </p>
        {billingPlans.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-4">
            {billingPlans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelectedPlanId(plan.id)}
                className={`text-left rounded-xl border p-3 transition-colors ${
                  selectedPlanId === plan.id
                    ? 'border-accent-invest bg-accent-invest/10'
                    : 'border-border'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{plan.name}</p>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-secondary">
                    {plan.interval === 'yearly' ? 'Anual' : 'Mensual'}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{plan.description}</p>
                <p className="text-sm font-semibold mt-2">
                  {plan.currency} {plan.amount.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                </p>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-sm text-muted-foreground">Estado:</span>
          <span
            className={`text-xs font-medium px-2.5 py-1 rounded-full ${
              isActivePlan
                ? 'bg-success/10 text-success'
                : isGracePeriod
                  ? 'bg-warning/10 text-warning'
                  : 'bg-destructive/10 text-destructive'
            }`}
          >
            {subscriptionStatusLabel[subscriptionStatus] || subscriptionStatus}
          </span>
          {gracePeriodEnd && (
            <span className="text-xs text-muted-foreground">
              Límite: {new Date(gracePeriodEnd).toLocaleString('es-AR')}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={startCheckout}
            disabled={billingLoading}
            className="btn btn-primary disabled:opacity-50"
          >
            {billingLoading ? 'Abriendo checkout...' : 'Gestionar suscripción'}
          </button>
          <a
            href="/recurring"
            className="px-4 py-2 rounded-lg border border-border text-sm"
          >
            Ver planes y recurrentes
          </a>
        </div>
      </div>

      {isGracePeriod && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-warning">
          <div className="font-semibold">Aviso de pago: estás en período de gracia</div>
          <p className="text-sm mt-1">
            El último cobro de tu suscripción falló. Podés seguir usando la IA temporalmente, pero
            necesitás actualizar el método de pago para no perder acceso.
          </p>
          {gracePeriodEnd && (
            <p className="text-xs mt-2">
              Límite de gracia: {new Date(gracePeriodEnd).toLocaleString('es-AR')}
            </p>
          )}
        </div>
      )}

      {isPastDue ? (
        <div className="card border-2 border-destructive/30">
          <h2 className="text-xl font-semibold mb-2">Bot de IA bloqueado por suscripcion</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Tu estado actual es <strong>{subscriptionStatus}</strong>. Para volver a usar el panel
            del bot de IA (Gemini + Telegram), necesitas activar o regularizar el pago.
          </p>
          <button
            type="button"
            onClick={startCheckout}
            disabled={billingLoading}
            className="btn btn-primary disabled:opacity-50"
          >
            {billingLoading ? 'Abriendo checkout...' : 'Actualizar suscripcion'}
          </button>
        </div>
      ) : (
        <>
      <div className="card border-2 border-info/30">
        <h2 className="text-xl font-semibold mb-2">Google Gemini (IA)</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Cada usuario puede usar su propia API Key de Google AI Studio. Así no compartís cuota ni
          costo con otros. Si no cargás nada, se intenta usar la clave del servidor (solo si el
          deployer la configuró).
        </p>

        <details className="mb-4 text-sm bg-secondary rounded-lg p-4">
          <summary className="cursor-pointer font-medium text-info">
            Cómo obtener tu API Key (paso a paso)
          </summary>
          <ol className="mt-3 space-y-2 list-decimal list-inside text-muted-foreground">
            <li>
              Entrá a{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-info underline"
              >
                Google AI Studio → API keys
              </a>
              .
            </li>
            <li>Iniciá sesión con tu cuenta de Google.</li>
            <li>Tocá &quot;Create API key&quot; y elegí un proyecto de Google Cloud (o creá uno).</li>
            <li>Copiá la clave (empieza con <code className="text-xs bg-secondary px-1 rounded">AIza</code>).</li>
            <li>Pegala abajo y guardá. Solo se guarda en tu fila de usuario.</li>
          </ol>
        </details>

        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">
            API Key {geminiConfigured ? '(ya configurada — pegá una nueva para reemplazar)' : ''}
          </label>
          <input
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder={geminiConfigured ? '••••••••' : 'Pegá tu API key de Gemini'}
            autoComplete="off"
            className="w-full px-4 py-2 rounded-lg border border-border bg-secondary font-mono text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={saveGeminiOnly}
            disabled={integLoading}
            className="btn btn-primary disabled:opacity-50"
          >
            {integLoading ? 'Guardando…' : 'Guardar Gemini'}
          </button>
          {geminiConfigured && (
            <button
              type="button"
              onClick={clearGeminiKey}
              disabled={integLoading}
              className="px-4 py-2 rounded-lg border border-border text-sm"
            >
              Quitar mi clave
            </button>
          )}
        </div>
      </div>

      <div className="card border-2 border-info/30">
        <h2 className="text-xl font-semibold mb-2">Telegram</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Podés usar el <strong>bot oficial de esta instancia de Zarix</strong> (un solo token en el
          servidor) y solo vincular tu chat, <strong>o</strong> crear tu propio bot con BotFather y
          apuntar el webhook a esta app. Las notificaciones y el chat del bot salen siempre por el
          bot que elijas (compartido o tuyo).
        </p>

        <details className="mb-4 text-sm bg-secondary rounded-lg p-4">
          <summary className="cursor-pointer font-medium text-info">
            Opción A — Bot de Zarix (recomendado)
          </summary>
          <ol className="mt-3 space-y-2 list-decimal list-inside">
            <li>Abrí el bot de Telegram que te indique quien desplegó Zarix (mismo bot para todos).</li>
            <li>Mandá <code className="text-xs bg-card px-1 rounded">/start</code>.</li>
            <li>Copiá el número (chat id) que te muestra el bot.</li>
            <li>Pegalo en &quot;Vincular Telegram&quot; más abajo.</li>
          </ol>
          <p className="mt-2 text-muted-foreground">
            No necesitás token de bot: el servidor ya tiene uno. Tu API de Gemini sigue siendo la
            tuya si la cargaste arriba.
          </p>
        </details>

        <details className="mb-4 text-sm bg-secondary rounded-lg p-4">
          <summary className="cursor-pointer font-medium text-info">
            Opción B — Tu propio bot
          </summary>
          <ol className="mt-3 space-y-2 list-decimal list-inside">
            <li>
              En Telegram, hablá con{' '}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-info underline"
              >
                @BotFather
              </a>
              , elegí <code className="text-xs bg-card px-1 rounded">/newbot</code> y seguí los
              pasos.
            </li>
            <li>Guardá el <strong>token</strong> que te da (algo como <code className="text-xs">123:ABC...</code>).</li>
            <li>
              Elegí &quot;Bot propio&quot; abajo, pegá el token y guardá. Se genera una URL de webhook única
              para tu usuario.
            </li>
            <li>
              Configurá el webhook en Telegram (desde tu PC, reemplazá TOKEN y la URL que te muestra
              la app):
              <pre className="mt-2 p-3 bg-gray-900 text-green-400 text-xs rounded overflow-x-auto">
{`curl -s -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"<URL_WEBHOOK_DE_LA_APP>","secret_token":"<SECRET_TOKEN>"}'`}
              </pre>
            </li>
            <li>Vuelve a esta pantalla: la URL exacta aparece después de guardar (incluye un código secreto en el path).</li>
            <li>Hablá con <strong>tu</strong> bot, mandá el código de vinculación (Configuración → Generar código). No se vincula solo con /start.</li>
          </ol>
        </details>

        <div className="space-y-3 mb-4">
          <span className="text-sm font-medium text-muted-foreground">Modo Telegram</span>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="tgmode"
              checked={telegramMode === 'shared'}
              onChange={() => setTelegramMode('shared')}
            />
            <span>Bot de la app (compartido) — solo vinculo mi chat</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="tgmode"
              checked={telegramMode === 'custom'}
              onChange={() => setTelegramMode('custom')}
            />
            <span>Bot propio (mi token de BotFather + webhook)</span>
          </label>
        </div>

        {telegramMode === 'custom' && (
          <div className="mb-4">
            <label className="text-sm text-muted-foreground">Token del bot (BotFather)</label>
            <input
              type="password"
              value={customBotToken}
              onChange={(e) => setCustomBotToken(e.target.value)}
              placeholder={telegramCustomMode ? '•••••••• (pegá uno nuevo para cambiar)' : '123456789:AAH...'}
              className="w-full px-4 py-2 rounded-lg border border-border bg-secondary font-mono text-sm"
            />
          </div>
        )}

        {telegramMode === 'custom' && webhookUrl && (
          <div className="mb-4 p-3 bg-warning/10 rounded-lg text-sm">
            <div className="font-medium text-warning mb-1">
              Tu URL de webhook (copiá esto en setWebhook)
            </div>
            <code className="break-all text-xs">{webhookUrl}</code>
            {lastWebhookSecretToken && (
              <p className="mt-2 text-xs">
                secret_token (no está en la URL):{' '}
                <code className="break-all">{lastWebhookSecretToken}</code>
              </p>
            )}
          </div>
        )}

        {!appBaseUrl && telegramMode === 'custom' && (
          <p className="text-warning text-sm mb-2">
            Definí <code className="text-xs">NEXT_PUBLIC_APP_URL</code> en el servidor para ver la
            URL completa del webhook.
          </p>
        )}

        <button
          type="button"
          onClick={saveTelegramOnly}
          disabled={integLoading}
          className="btn btn-primary disabled:opacity-50"
        >
          {integLoading ? 'Guardando…' : 'Guardar configuración Telegram'}
        </button>
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Vincular chat de Telegram</h2>

        {user.telegram_chat_id ? (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Estado</div>
            <div className="text-success font-medium">✅ Vinculado</div>
            {user.telegram_username && (
              <div className="text-sm text-muted-foreground">
                Usuario: @{user.telegram_username}
              </div>
            )}
            <div className="text-sm text-muted-foreground mt-4">
              Chat ID: {user.telegram_chat_id}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Generá un código y envialo al bot (el de Zarix o el tuyo si ya configuraste
              webhook) enviando <code className="text-xs bg-secondary px-1 rounded">/start</code> y
              pegándolo en el chat. El código vale 10 minutos.
            </div>

            <button
              onClick={handleGenerateLinkCode}
              disabled={loading}
              className="w-full btn btn-primary disabled:opacity-50"
            >
              {loading ? 'Generando...' : 'Generar código de vinculación'}
            </button>

            {linkCode && (
              <div className="text-center">
                <div className="text-xs text-muted-foreground mb-1">Tu código (enviáselo al bot):</div>
                <div className="font-mono text-2xl font-bold tracking-widest select-all">
                  {linkCode}
                </div>
              </div>
            )}

            {message && (
              <div
                className={`text-sm p-3 rounded-lg ${
                  message.startsWith('✅')
                    ? 'bg-success/10 text-success'
                    : 'bg-destructive/10 text-destructive'
                }`}
              >
                {message}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold mb-2">Notificaciones por Telegram</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Mismo ajuste que en el bot con <code className="text-xs bg-secondary px-1 rounded">/resumenes</code>
          . Los envíos siguen el horario del servidor (≈09:00 UTC); abajo ves la fecha aproximada en tu zona.
        </p>
        <div className="space-y-4">
          <label className="flex items-start justify-between gap-3 cursor-pointer">
            <span className="text-sm">
              <span className="font-medium block">Resumen semanal</span>
              <span className="text-muted-foreground text-xs">
                Cada lunes (semana cerrada).{' '}
                {weeklySummary && nextWeeklyLabel ? (
                  <span className="block mt-1 text-info">
                    Próximo: {nextWeeklyLabel}
                  </span>
                ) : !weeklySummary ? (
                  <span className="block mt-1">Desactivado — no se envía.</span>
                ) : null}
              </span>
            </span>
            <input
              type="checkbox"
              checked={weeklySummary}
              disabled={notifLoading}
              onChange={(e) => saveNotificationToggle('weekly_summary_enabled', e.target.checked)}
              className="w-6 h-6 mt-1 shrink-0 accent-primary"
            />
          </label>
          <label className="flex items-start justify-between gap-3 cursor-pointer">
            <span className="text-sm">
              <span className="font-medium block">Resumen mensual</span>
              <span className="text-muted-foreground text-xs">
                Día 1 de cada mes (mes cerrado).{' '}
                {monthlySummary && nextMonthlyLabel ? (
                  <span className="block mt-1 text-info">
                    Próximo: {nextMonthlyLabel}
                  </span>
                ) : !monthlySummary ? (
                  <span className="block mt-1">Desactivado — no se envía.</span>
                ) : null}
              </span>
            </span>
            <input
              type="checkbox"
              checked={monthlySummary}
              disabled={notifLoading}
              onChange={(e) => saveNotificationToggle('monthly_summary_enabled', e.target.checked)}
              className="w-6 h-6 mt-1 shrink-0 accent-primary"
            />
          </label>
        </div>
      </div>
      </>
      )}

      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Preferencias</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">Moneda por defecto</label>
            <select
              defaultValue={user.default_currency}
              className="w-full px-4 py-2 rounded-lg border border-border bg-secondary"
            >
              <option value="ARS">ARS (Peso Argentino)</option>
              <option value="USD">USD (Dólar)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
