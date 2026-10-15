import { sendTelegramDm } from '@/lib/telegram/send';

// Alerta operativa best-effort al admin vía el bot de Telegram que la app ya
// tiene (sin agregar un vendor nuevo). Cierra el hueco de "los crons fallan en
// silencio": un job de billing (subscription-grace) que rompe ahora avisa.
// Requiere TELEGRAM_ADMIN_CHAT_ID; si no está seteado, degrada a no-op.
export async function alertAdmin(message: string): Promise<void> {
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!adminChatId) return;
  const chatId = Number(adminChatId);
  if (!Number.isFinite(chatId)) return;

  try {
    await sendTelegramDm(chatId, `🚨 Zarix alerta\n\n${message}`);
  } catch {
    // Nunca dejar que la alerta tumbe el flujo que la disparó.
    console.error('[alert] no se pudo notificar al admin');
  }
}
