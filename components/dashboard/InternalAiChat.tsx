'use client';

import { FormEvent, useMemo, useState } from 'react';
import type {
  InternalAiChatHistoryItem,
  InternalAiChatRequest,
  InternalAiChatSuccessResponse,
} from '@/types/internal-ai-chat';

type UiMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  executed?: InternalAiChatSuccessResponse['executed'];
};

function toApiHistory(messages: UiMessage[]): InternalAiChatHistoryItem[] {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    text: message.text,
  }));
}

interface InternalAiChatProps {
  embedded?: boolean;
  className?: string;
}

export default function InternalAiChat({ embedded = false, className = '' }: InternalAiChatProps) {
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Escribime un gasto o ingreso en lenguaje natural y lo registro por vos.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedStatus, setBlockedStatus] = useState<'PAST_DUE' | 'CANCELED' | null>(null);

  const canSend = useMemo(
    () => !loading && input.trim().length > 0 && blockedStatus === null,
    [loading, input, blockedStatus]
  );

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) return;

    const text = input.trim();
    const userMessage: UiMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      text,
    };
    const optimistic = [...messages, userMessage];
    setMessages(optimistic);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const payload: InternalAiChatRequest = {
        message: text,
        history: toApiHistory(messages),
      };

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        if (
          response.status === 403 &&
          data?.code === 'subscription_required' &&
          (data?.status === 'PAST_DUE' || data?.status === 'CANCELED')
        ) {
          setBlockedStatus(data.status);
        }
        throw new Error(data?.error || 'No pude procesar tu mensaje.');
      }

      const chatResponse = data as InternalAiChatSuccessResponse;
      const assistantMessage: UiMessage = {
        id: `${Date.now()}-assistant`,
        role: 'assistant',
        text: chatResponse.assistant_message,
        executed: chatResponse.mode === 'executed' ? (chatResponse.executed ?? []) : undefined,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (requestError: unknown) {
      const message =
        requestError instanceof Error ? requestError.message : 'No pude enviar el mensaje.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={`${embedded ? '' : 'card'} space-y-3 ${className}`.trim()}>
      {!embedded && (
        <div>
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
            Bot interno de movimientos
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Ejemplos: &quot;gasté 5000 en super&quot;, &quot;pagué netflix con visa 15 usd&quot;.
          </p>
        </div>
      )}

      {blockedStatus && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-900/20 dark:text-amber-200">
          {blockedStatus === 'PAST_DUE'
            ? 'Tu suscripción está vencida. Actualizá tu método de pago para volver a registrar movimientos con IA.'
            : 'Tu suscripción está cancelada. Reactivala para volver a usar el bot interno.'}{' '}
          <a className="underline font-medium" href="/settings">
            Ir a Configuración
          </a>
        </div>
      )}

      <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[92%] rounded-xl px-3 py-2 text-sm ${
                message.role === 'user'
                  ? 'ml-auto bg-emerald-600 text-white'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
              }`}
            >
              <p className="whitespace-pre-wrap">{message.text}</p>
              {message.executed && message.executed.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {message.executed.map((item, index) => (
                    <li key={`${message.id}-${index}`} className="rounded bg-white/30 px-2 py-1 dark:bg-slate-700/40">
                      {item.summary}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {loading && (
            <div className="max-w-[92%] rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Pensando...
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-2 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={sendMessage} className="flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Escribí un movimiento..."
          className="input flex-1"
          disabled={loading || blockedStatus !== null}
        />
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </section>
  );
}
