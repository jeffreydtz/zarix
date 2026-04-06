import type { Content } from '@google/generative-ai';
import { createServiceClientSync } from '@/lib/supabase/server';

/** Turnos guardados para reconstruir historial de Gemini (user/model alternados). */
export type StoredBotTurn = { role: 'user' | 'model'; text: string };

const MAX_STORED_MESSAGES = 24; /** Máximo de mensajes user+model (≈12 intercambios). */

export function storedTurnsToGeminiHistory(turns: StoredBotTurn[]): Content[] {
  return turns.map((t) => ({
    role: t.role === 'user' ? 'user' : 'model',
    parts: [{ text: t.text }],
  }));
}

export async function getStoredTurns(
  userId: string,
  telegramChatId: number
): Promise<StoredBotTurn[]> {
  const supabase = createServiceClientSync();
  const { data } = await supabase
    .from('bot_sessions')
    .select('context')
    .eq('telegram_chat_id', telegramChatId)
    .eq('user_id', userId)
    .maybeSingle();

  return parseStoredContext(data?.context);
}

function parseStoredContext(raw: unknown): StoredBotTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is StoredBotTurn =>
      t &&
      typeof t === 'object' &&
      (t.role === 'user' || t.role === 'model') &&
      typeof t.text === 'string'
  );
}

export async function appendBotTurn(
  userId: string,
  telegramChatId: number,
  userText: string,
  modelText: string
): Promise<void> {
  const supabase = createServiceClientSync();
  const { data: row } = await supabase
    .from('bot_sessions')
    .select('id, context')
    .eq('telegram_chat_id', telegramChatId)
    .eq('user_id', userId)
    .maybeSingle();

  const prev = parseStoredContext(row?.context);
  const next: StoredBotTurn[] = [
    ...prev,
    { role: 'user', text: userText },
    { role: 'model', text: modelText },
  ];
  const sliced =
    next.length > MAX_STORED_MESSAGES ? next.slice(-MAX_STORED_MESSAGES) : next;

  const now = new Date().toISOString();

  if (row?.id) {
    await supabase
      .from('bot_sessions')
      .update({ context: sliced, last_message_at: now })
      .eq('id', row.id);
  } else {
    await supabase.from('bot_sessions').insert({
      user_id: userId,
      telegram_chat_id: telegramChatId,
      context: sliced,
      last_message_at: now,
    });
  }
}

export async function clearBotSession(userId: string, telegramChatId: number): Promise<void> {
  const supabase = createServiceClientSync();
  const { data: row } = await supabase
    .from('bot_sessions')
    .select('id')
    .eq('telegram_chat_id', telegramChatId)
    .eq('user_id', userId)
    .maybeSingle();

  if (row?.id) {
    await supabase
      .from('bot_sessions')
      .update({ context: [], last_message_at: new Date().toISOString() })
      .eq('id', row.id);
  }
}
