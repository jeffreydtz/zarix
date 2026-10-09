import type { ServiceClient } from '@/lib/cron/cron-job';
import { sendTelegramDm } from '@/lib/telegram/send';

export async function enqueueNotification(
  supabase: ServiceClient, userId: string, eventKey: string, text: string
): Promise<void> {
  // A unique event is only ever created once; a retry cannot overwrite delivery state.
  const { error } = await supabase.from('notification_outbox').upsert({
    user_id: userId, event_key: eventKey, payload: { kind: 'message', text },
  }, { onConflict: 'user_id,event_key', ignoreDuplicates: true });
  if (error) throw error;
}

function notificationText(payload: Record<string, any>): string {
  if (payload.kind === 'message' && typeof payload.text === 'string') return payload.text;
  if (payload.kind !== 'recurring') throw new Error('Tipo de aviso desconocido');
  const frequency = ({ daily: 'diario', weekly: 'semanal', monthly: 'mensual', yearly: 'anual' } as Record<string, string>)[payload.frequency] || payload.frequency;
  const type = payload.type === 'expense' ? '💸 Gasto' : '💰 Ingreso';
  return `🔄 *Transacción recurrente ejecutada*\n\n${type} ${frequency}: *${payload.description || ''}*\n💰 $${Number(payload.amount).toLocaleString('es-AR')} ${payload.currency}`;
}

/** At-least-once delivery. A lost provider acknowledgement can repeat a notice,
 * but delivery never creates or reverses a financial transaction. */
export async function deliverNotificationOutbox(supabase: ServiceClient): Promise<{ delivered: number; failed: number }> {
  const { data: items, error } = await supabase.rpc('claim_notification_outbox', { p_limit: 100 });
  if (error) throw error;
  const deadline = Date.now() + 8_000;
  let delivered = 0;
  let failed = 0;
  const claimed = items || [];
  for (const [index, item] of claimed.entries()) {
    if (Date.now() >= deadline) {
      // One bulk release avoids a long tail of per-item queries after the budget.
      const { error: releaseError } = await supabase.rpc('release_notification_outbox', {
        p_claims: claimed.slice(index).map((event: { id: string; lease_token: string }) => ({ id: event.id, lease_token: event.lease_token })),
      });
      if (releaseError) console.error('[outbox] unused leases will expire');
      break;
    }
    try {
      const { data: user, error: userError } = await supabase.from('users')
        .select('telegram_chat_id, telegram_bot_token').eq('id', item.user_id).single();
      if (userError) throw userError;
      if (!user?.telegram_chat_id) throw new Error('Telegram no vinculado');
      await sendTelegramDm(user.telegram_chat_id, notificationText(item.payload), {
        parse_mode: 'Markdown', botToken: user.telegram_bot_token,
      });
      const { data: acknowledged, error: ackError } = await supabase.from('notification_outbox')
        .update({ delivered_at: new Date().toISOString(), lease_until: null, lease_token: null, last_error: null })
        .eq('id', item.id).eq('user_id', item.user_id).eq('lease_token', item.lease_token)
        .select('id').maybeSingle();
      if (ackError) throw ackError;
      if (!acknowledged) throw new Error('La entrega perdió su reserva');
      delivered++;
    } catch {
      failed++;
      // Do not store raw provider errors: they may contain bot credentials.
      const delay = Math.min(3600, 30 * 2 ** Math.min(item.attempts, 7));
      const { error: retryError } = await supabase.from('notification_outbox')
        .update({ lease_until: null, lease_token: null, last_error: 'Entrega no confirmada',
          available_at: new Date(Date.now() + delay * 1000).toISOString() })
        .eq('id', item.id).eq('user_id', item.user_id).eq('lease_token', item.lease_token);
      // If retry bookkeeping fails, the lease expires; the durable event is retained.
      if (retryError) console.error('[outbox] could not release notification lease');
    }
  }
  return { delivered, failed };
}
