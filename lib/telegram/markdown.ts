/**
 * Escapa texto controlado por el usuario antes de interpolarlo en mensajes con
 * `parse_mode: 'Markdown'` (legacy). Sin esto, un nombre de cuenta con `_`, `*`,
 * `[` o `` ` `` rompe el parseo de Telegram y el envío falla silenciosamente.
 */
export function escapeMd(value: unknown): string {
  return String(value ?? '').replace(/([_*`\[])/g, '\\$1');
}
