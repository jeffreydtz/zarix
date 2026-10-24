// Columnas de `users` seguras para exponer a un cliente autenticado.
// Excluye secretos que nunca deben volver al browser (revocados a nivel columna
// en la migración 20260811120000): gemini_api_key, telegram_bot_token,
// mp_preapproval_id, telegram_link_code. `telegram_webhook_secret` SÍ se incluye:
// el dueño lo necesita para configurar el webhook de su bot propio.
export const USER_CLIENT_SAFE_COLUMNS = [
  'id',
  'telegram_chat_id',
  'telegram_username',
  'telegram_webhook_secret',
  'status',
  'current_period_end',
  'grace_period_end',
  'default_currency',
  'net_worth_widget_visible',
  'timezone',
  'notification_time',
  'daily_summary_enabled',
  'weekly_summary_enabled',
  'monthly_summary_enabled',
  'onboarding_done',
  'wallet_auto_confirm',
  'created_at',
  'updated_at',
].join(', ');
