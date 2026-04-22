'use client';

import { useState, useEffect } from 'react';
import type { User } from '@/types/database';

interface SettingsFormProps {
  user: User;
  geminiConfigured: boolean;
  telegramCustomMode: boolean;
  webhookSecret: string | null;
  appBaseUrl: string;
}

export default function SettingsForm({
  user,
  geminiConfigured,
  telegramCustomMode,
  webhookSecret,
  appBaseUrl,
}: SettingsFormProps) {
  const [telegramChatId, setTelegramChatId] = useState('');
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

  const [weeklySummary, setWeeklySummary] = useState(user.weekly_summary_enabled);
  const [monthlySummary, setMonthlySummary] = useState(user.monthly_summary_enabled);
  const [nextWeeklyLabel, setNextWeeklyLabel] = useState<string | null>(null);
  const [nextMonthlyLabel, setNextMonthlyLabel] = useState<string | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);

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

  const handleLinkTelegram = async () => {
    if (!telegramChatId) return;

    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/auth/link-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramChatId: parseInt(telegramChatId, 10) }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Error al vincular Telegram');
      }

      setMessage('✅ Telegram vinculado correctamente');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error: unknown) {
      const err = error as { message?: string };
      setMessage(`❌ ${err.message || 'Error al vincular Telegram'}`);
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
      setTimeout(() => window.location.reload(), 1500);
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
      setIntegMessage('✅ Configuración de Telegram guardada. Si usás bot propio, configurá el webhook con curl.');
      setCustomBotToken('');
      setTimeout(() => window.location.reload(), 2000);
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
      setTimeout(() => window.location.reload(), 1500);
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
            <label className="text-sm text-gray-500">User ID</label>
            <div className="font-mono text-sm bg-gray-100 dark:bg-gray-700 p-2 rounded">
              {user.id}
            </div>
          </div>
        </div>
      </div>

      {integMessage && (
        <div
          className={`p-4 rounded-xl text-sm ${
            integMessage.startsWith('✅')
              ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
              : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
          }`}
        >
          {integMessage}
        </div>
      )}

      <div className="card border-2 border-indigo-200 dark:border-indigo-900">
        <h2 className="text-xl font-semibold mb-2">Google Gemini (IA)</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Cada usuario puede usar su propia API Key de Google AI Studio. Así no compartís cuota ni
          costo con otros. Si no cargás nada, se intenta usar la clave del servidor (solo si el
          deployer la configuró).
        </p>

        <details className="mb-4 text-sm bg-slate-50 dark:bg-slate-800/80 rounded-lg p-4">
          <summary className="cursor-pointer font-medium text-indigo-700 dark:text-indigo-300">
            Cómo obtener tu API Key (paso a paso)
          </summary>
          <ol className="mt-3 space-y-2 list-decimal list-inside text-gray-700 dark:text-gray-300">
            <li>
              Entrá a{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-600 underline"
              >
                Google AI Studio → API keys
              </a>
              .
            </li>
            <li>Iniciá sesión con tu cuenta de Google.</li>
            <li>Tocá &quot;Create API key&quot; y elegí un proyecto de Google Cloud (o creá uno).</li>
            <li>Copiá la clave (empieza con <code className="text-xs bg-gray-200 dark:bg-gray-600 px-1 rounded">AIza</code>).</li>
            <li>Pegala abajo y guardá. Solo se guarda en tu fila de usuario.</li>
          </ol>
        </details>

        <div className="space-y-2">
          <label className="text-sm text-gray-500">
            API Key {geminiConfigured ? '(ya configurada — pegá una nueva para reemplazar)' : ''}
          </label>
          <input
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder={geminiConfigured ? '••••••••' : 'Pegá tu API key de Gemini'}
            autoComplete="off"
            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 font-mono text-sm"
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
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm"
            >
              Quitar mi clave
            </button>
          )}
        </div>
      </div>

      <div className="card border-2 border-sky-200 dark:border-sky-900">
        <h2 className="text-xl font-semibold mb-2">Telegram</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Podés usar el <strong>bot oficial de esta instancia de Zarix</strong> (un solo token en el
          servidor) y solo vincular tu chat, <strong>o</strong> crear tu propio bot con BotFather y
          apuntar el webhook a esta app. Las notificaciones y el chat del bot salen siempre por el
          bot que elijas (compartido o tuyo).
        </p>

        <details className="mb-4 text-sm bg-slate-50 dark:bg-slate-800/80 rounded-lg p-4">
          <summary className="cursor-pointer font-medium text-sky-700 dark:text-sky-300">
            Opción A — Bot de Zarix (recomendado)
          </summary>
          <ol className="mt-3 space-y-2 list-decimal list-inside">
            <li>Abrí el bot de Telegram que te indique quien desplegó Zarix (mismo bot para todos).</li>
            <li>Mandá <code className="text-xs bg-gray-200 dark:bg-gray-600 px-1 rounded">/start</code>.</li>
            <li>Copiá el número (chat id) que te muestra el bot.</li>
            <li>Pegalo en &quot;Vincular Telegram&quot; más abajo.</li>
          </ol>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            No necesitás token de bot: el servidor ya tiene uno. Tu API de Gemini sigue siendo la
            tuya si la cargaste arriba.
          </p>
        </details>

        <details className="mb-4 text-sm bg-slate-50 dark:bg-slate-800/80 rounded-lg p-4">
          <summary className="cursor-pointer font-medium text-sky-700 dark:text-sky-300">
            Opción B — Tu propio bot
          </summary>
          <ol className="mt-3 space-y-2 list-decimal list-inside">
            <li>
              En Telegram, hablá con{' '}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-600 underline"
              >
                @BotFather
              </a>
              , elegí <code className="text-xs bg-gray-200 px-1 rounded">/newbot</code> y seguí los
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
  -d '{"url":"<URL_WEBHOOK_DE_LA_APP>"}'`}
              </pre>
            </li>
            <li>Vuelve a esta pantalla: la URL exacta aparece después de guardar (incluye un código secreto en el path).</li>
            <li>Hablá con <strong>tu</strong> bot, mandá /start y vinculá el chat id como en la opción A.</li>
          </ol>
        </details>

        <div className="space-y-3 mb-4">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Modo Telegram</span>
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
            <label className="text-sm text-gray-500">Token del bot (BotFather)</label>
            <input
              type="password"
              value={customBotToken}
              onChange={(e) => setCustomBotToken(e.target.value)}
              placeholder={telegramCustomMode ? '•••••••• (pegá uno nuevo para cambiar)' : '123456789:AAH...'}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 font-mono text-sm"
            />
          </div>
        )}

        {telegramMode === 'custom' && webhookUrl && (
          <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-950/40 rounded-lg text-sm">
            <div className="font-medium text-amber-900 dark:text-amber-200 mb-1">
              Tu URL de webhook (copiá esto en setWebhook)
            </div>
            <code className="break-all text-xs">{webhookUrl}</code>
          </div>
        )}

        {!appBaseUrl && telegramMode === 'custom' && (
          <p className="text-amber-700 dark:text-amber-300 text-sm mb-2">
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
            <div className="text-sm text-gray-500">Estado</div>
            <div className="text-green-600 font-medium">✅ Vinculado</div>
            {user.telegram_username && (
              <div className="text-sm text-gray-500">
                Usuario: @{user.telegram_username}
              </div>
            )}
            <div className="text-sm text-gray-500 mt-4">
              Chat ID: {user.telegram_chat_id}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Abrí el bot (el de Zarix o el tuyo si ya configuraste webhook), enviá /start y pegá el
              número acá:
            </div>

            <div>
              <input
                type="text"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder="123456789"
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
              />
            </div>

            <button
              onClick={handleLinkTelegram}
              disabled={loading || !telegramChatId}
              className="w-full btn btn-primary disabled:opacity-50"
            >
              {loading ? 'Vinculando...' : 'Vincular Telegram'}
            </button>

            {message && (
              <div
                className={`text-sm p-3 rounded-lg ${
                  message.startsWith('✅')
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
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
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Mismo ajuste que en el bot con <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">/resumenes</code>
          . Los envíos siguen el horario del servidor (≈09:00 UTC); abajo ves la fecha aproximada en tu zona.
        </p>
        <div className="space-y-4">
          <label className="flex items-start justify-between gap-3 cursor-pointer">
            <span className="text-sm">
              <span className="font-medium block">Resumen semanal</span>
              <span className="text-gray-500 dark:text-gray-400 text-xs">
                Cada lunes (semana cerrada).{' '}
                {weeklySummary && nextWeeklyLabel ? (
                  <span className="block mt-1 text-indigo-600 dark:text-indigo-400">
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
              className="w-6 h-6 mt-1 shrink-0 accent-emerald-600"
            />
          </label>
          <label className="flex items-start justify-between gap-3 cursor-pointer">
            <span className="text-sm">
              <span className="font-medium block">Resumen mensual</span>
              <span className="text-gray-500 dark:text-gray-400 text-xs">
                Día 1 de cada mes (mes cerrado).{' '}
                {monthlySummary && nextMonthlyLabel ? (
                  <span className="block mt-1 text-indigo-600 dark:text-indigo-400">
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
              className="w-6 h-6 mt-1 shrink-0 accent-emerald-600"
            />
          </label>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Preferencias</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Moneda por defecto</label>
            <select
              defaultValue={user.default_currency}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700"
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
