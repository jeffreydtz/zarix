-- Idempotent profile row: safe if trigger runs twice or row pre-exists
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, default_currency, timezone)
  VALUES (
    NEW.id,
    'ARS',
    'America/Argentina/Buenos_Aires'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
