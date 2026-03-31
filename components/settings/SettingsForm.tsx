'use client';

import { useState } from 'react';
import type { User } from '@/types/database';

interface SettingsFormProps {
  user: User;
}

export default function SettingsForm({ user }: SettingsFormProps) {
  const [telegramChatId, setTelegramChatId] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleLinkTelegram = async () => {
    if (!telegramChatId) return;

    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/auth/link-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramChatId: parseInt(telegramChatId) }),
      });

      if (!response.ok) throw new Error('Error linking Telegram');

      setMessage('✅ Telegram vinculado correctamente');
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      setMessage('❌ Error al vincular Telegram');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Cuenta</h2>
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-500">Email</label>
            <div className="font-medium">{user.id}</div>
          </div>

          <div>
            <label className="text-sm text-gray-500">User ID</label>
            <div className="font-mono text-sm bg-gray-100 dark:bg-gray-700 p-2 rounded">
              {user.id}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Telegram Bot</h2>

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
              Para vincular tu bot de Telegram:
            </div>

            <ol className="text-sm space-y-2 list-decimal list-inside">
              <li>Abrí Telegram y buscá tu bot</li>
              <li>Mandá el comando: /start</li>
              <li>Copiá el número que te muestra</li>
              <li>Pegalo acá abajo:</li>
            </ol>

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
        <h2 className="text-xl font-semibold mb-4">Notificaciones</h2>
        <div className="space-y-3">
          <label className="flex items-center justify-between">
            <span>Resumen diario (22hs)</span>
            <input
              type="checkbox"
              defaultChecked={user.daily_summary_enabled}
              className="w-5 h-5"
            />
          </label>
          <label className="flex items-center justify-between">
            <span>Resumen semanal (lunes)</span>
            <input
              type="checkbox"
              defaultChecked={user.weekly_summary_enabled}
              className="w-5 h-5"
            />
          </label>
          <label className="flex items-center justify-between">
            <span>Resumen mensual (día 1)</span>
            <input
              type="checkbox"
              defaultChecked={user.monthly_summary_enabled}
              className="w-5 h-5"
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
