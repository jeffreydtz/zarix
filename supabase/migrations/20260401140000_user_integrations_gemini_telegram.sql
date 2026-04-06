-- Per-user Gemini API key and optional own Telegram bot (webhook path slug)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS gemini_api_key TEXT,
  ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT,
  ADD COLUMN IF NOT EXISTS telegram_webhook_secret TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_telegram_webhook_secret
  ON public.users (telegram_webhook_secret)
  WHERE telegram_webhook_secret IS NOT NULL;

COMMENT ON COLUMN public.users.gemini_api_key IS 'User Google AI Studio key; falls back to GEMINI_API_KEY env when null';
COMMENT ON COLUMN public.users.telegram_bot_token IS 'Optional BotFather token; null = shared TELEGRAM_BOT_TOKEN';
COMMENT ON COLUMN public.users.telegram_webhook_secret IS 'Opaque slug for /api/telegram/webhook/u/:secret';
