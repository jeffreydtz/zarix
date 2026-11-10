-- Patrimonio real 2.0: TNA/ticker de benchmarks que el usuario carga a mano
-- cuando no hay una serie pública confiable (caución, FCI money market).
-- NEVER supabase db push against production from a preview: leave this in git.

CREATE TABLE IF NOT EXISTS public.user_benchmark_settings (
  user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  plazo_fijo_tna NUMERIC(8, 4),
  plazo_fijo_label TEXT,
  caucion_tna NUMERIC(8, 4),
  caucion_label TEXT,
  fci_mm_ticker TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_benchmark_plazo_fijo_tna_range
    CHECK (plazo_fijo_tna IS NULL OR (plazo_fijo_tna >= 0 AND plazo_fijo_tna <= 400)),
  CONSTRAINT user_benchmark_caucion_tna_range
    CHECK (caucion_tna IS NULL OR (caucion_tna >= 0 AND caucion_tna <= 400)),
  CONSTRAINT user_benchmark_fci_ticker_len
    CHECK (fci_mm_ticker IS NULL OR char_length(fci_mm_ticker) BETWEEN 1 AND 32)
);

ALTER TABLE public.user_benchmark_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_benchmark_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_benchmark_settings_own ON public.user_benchmark_settings;
CREATE POLICY user_benchmark_settings_own
  ON public.user_benchmark_settings
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON public.user_benchmark_settings FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_benchmark_settings TO authenticated;
GRANT ALL ON public.user_benchmark_settings TO service_role;

COMMENT ON TABLE public.user_benchmark_settings IS
  'Optional user-supplied TNA/ticker for real-return benchmarks. Null means use public source or mark unavailable.';
