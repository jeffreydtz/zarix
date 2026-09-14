import { createServiceClientSync } from '@/lib/supabase/server';

/** Consume the one-time code in the same conditional update that links the chat. */
export async function redeemLinkCode(
  code: string,
  telegramChatId: number,
  username?: string,
  expectedUserId?: string
): Promise<'ok' | 'invalid' | 'taken'> {
  const supabase = createServiceClientSync();
  let query = supabase.from('users').update({
    telegram_chat_id: telegramChatId,
    telegram_username: username || null,
    telegram_link_code: null,
    telegram_link_code_expires_at: null,
  }).eq('telegram_link_code', code.toUpperCase().trim())
    .gt('telegram_link_code_expires_at', new Date().toISOString());
  if (expectedUserId) query = query.eq('id', expectedUserId);
  const { data, error } = await query.select('id').maybeSingle();
  if (error) {
    if (error.code === '23505') return 'taken';
    throw error;
  }
  return data ? 'ok' : 'invalid';
}
