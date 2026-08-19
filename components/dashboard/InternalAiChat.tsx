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
  historyText?: string;
  executed?: InternalAiChatSuccessResponse['executed'];
  pendingConfirm?: string;
};

const EXAMPLE_CHIPS = [
  'Gasté 5000 en el super',
  'Cobré el sueldo 800 mil',
  'Pagué Netflix 15 USD',
];

function toApiHistory(messages: UiMessage[]): InternalAiChatHistoryItem[] {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    text: message.historyText || message.text,
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

  const sendText = async (text: string) => {
    if (!text.trim() || loading || blockedStatus !== null) return;
    const userMessage: UiMessage = {
      id: `${Date.now()}-user`,
      role: 'user',
      text,
    };
    const historySnapshot = messages;
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const payload: InternalAiChatRequest = {
        message: text,
        history: toApiHistory(historySnapshot),
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
        historyText: chatResponse.raw_response || chatResponse.assistant_message,
        executed: chatResponse.mode === 'executed' ? (chatResponse.executed ?? []) : undefined,
        pendingConfirm:
          chatResponse.mode === 'confirm' ? chatResponse.pending_confirm?.preview : undefined,
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

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) return;
    await sendText(input.trim());
  };

  return (
    <section className={`${embedded ? '' : 'card'} ${embedded ? 'space-y-2.5' : 'space-y-3'} ${className}`.trim()}>
      {!embedded && (
        <div>
          <h3 className="text-lg font-semibold text-foreground">Asistente</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Escribí el movimiento como lo dirías: &quot;gasté 5000 en el super&quot;.
          </p>
        </div>
      )}

      {blockedStatus && (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          {blockedStatus === 'PAST_DUE'
            ? 'Tu suscripción está vencida. Actualizá tu método de pago para volver a registrar movimientos con IA.'
            : 'Tu suscripción está cancelada. Reactivala para volver a usar el bot interno.'}{' '}
          <a className="underline font-medium" href="/settings">
            Ir a Configuración
          </a>
        </div>
      )}

      <div
        className={`overflow-y-auto rounded-xl p-3 max-h-60 border border-border bg-card`}
      >
        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[92%] rounded-xl px-3 py-2 text-sm ${
                message.role === 'user'
                  ? 'ml-auto bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground'
              }`}
            >
              <p className="whitespace-pre-wrap">{message.text}</p>
              {message.pendingConfirm && (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    onClick={() => sendText('sí, confirmá')}
                  >
                    Sí
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-background/70 px-3 py-1.5 text-xs font-medium"
                    onClick={() => sendText('no, cancelá')}
                  >
                    No
                  </button>
                </div>
              )}
              {message.executed && message.executed.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs">
                  {message.executed.map((item, index) => (
                    <li key={`${message.id}-${index}`} className="rounded bg-background/50 px-2 py-1">
                      {item.summary}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {loading && (
            <div className="max-w-[92%] rounded-xl bg-secondary px-3 py-2 text-sm text-muted-foreground">
              Pensando...
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-destructive/10 p-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {messages.length <= 1 && !blockedStatus && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLE_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => sendText(chip)}
              className="rounded-full border border-border bg-secondary px-2.5 py-1 text-xs text-foreground"
            >
              {chip}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={sendMessage} className="flex items-stretch gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Escribí un movimiento..."
          className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition focus:ring-2 focus:ring-ring"
          disabled={loading || blockedStatus !== null}
        />
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-95"
        >
          Enviar
        </button>
      </form>
    </section>
  );
}
