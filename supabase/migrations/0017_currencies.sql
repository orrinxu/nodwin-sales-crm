-- supabase/migrations/0017_currencies.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Currency registry table (ORR-142 / F-003).
--
-- The code column is constrained to ASCII uppercase alphanumeric only,
-- 1–8 characters, enforcing the pattern /^[A-Z0-9]{1,8}$/.
--
-- Provides:
--   • Table    public.currencies  — currency registry
--   • Seed     ISO 4217 currencies + USDT
--
-- Idempotent: safe to re-run.

-- ── Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.currencies (
  code       text        PRIMARY KEY,
  name       text        NOT NULL,
  scale      integer     NOT NULL CHECK (scale >= 0 AND scale <= 12),
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enforce ASCII uppercase alphanumeric, 1–8 characters
ALTER TABLE public.currencies
  DROP CONSTRAINT IF EXISTS currencies_code_ascii_uppercase_alphanumeric;

ALTER TABLE public.currencies
  ADD CONSTRAINT currencies_code_ascii_uppercase_alphanumeric
  CHECK (code ~ '^[A-Z0-9]{1,8}$');

-- ── Index ──────────────────────────────────────────────────────────────────

-- Index for active lookups (most queries filter on active = true)
CREATE INDEX IF NOT EXISTS idx_currencies_active
  ON public.currencies (code)
  WHERE active;

-- ── Seed data ──────────────────────────────────────────────────────────────
-- ISO 4217 currency codes commonly relevant to Nodwin Group markets plus
-- USDT (USD-pegged stablecoin, scale 4, tracked separately from USD).

INSERT INTO public.currencies (code, name, scale, active) VALUES
  ('AED', 'UAE Dirham', 2, true),
  ('ARS', 'Argentine Peso', 2, true),
  ('AUD', 'Australian Dollar', 2, true),
  ('BRL', 'Brazilian Real', 2, true),
  ('CAD', 'Canadian Dollar', 2, true),
  ('CHF', 'Swiss Franc', 2, true),
  ('CNY', 'Chinese Yuan', 2, true),
  ('CZK', 'Czech Koruna', 2, true),
  ('DKK', 'Danish Krone', 2, true),
  ('EGP', 'Egyptian Pound', 2, true),
  ('EUR', 'Euro', 2, true),
  ('GBP', 'British Pound', 2, true),
  ('HKD', 'Hong Kong Dollar', 2, true),
  ('IDR', 'Indonesian Rupiah', 2, true),
  ('ILS', 'Israeli Shekel', 2, true),
  ('INR', 'Indian Rupee', 2, true),
  ('JPY', 'Japanese Yen', 0, true),
  ('KRW', 'South Korean Won', 0, true),
  ('MXN', 'Mexican Peso', 2, true),
  ('MYR', 'Malaysian Ringgit', 2, true),
  ('NGN', 'Nigerian Naira', 2, true),
  ('NOK', 'Norwegian Krone', 2, true),
  ('NZD', 'New Zealand Dollar', 2, true),
  ('PHP', 'Philippine Peso', 2, true),
  ('PKR', 'Pakistani Rupee', 2, true),
  ('PLN', 'Polish Zloty', 2, true),
  ('QAR', 'Qatari Riyal', 2, true),
  ('RON', 'Romanian Leu', 2, true),
  ('RUB', 'Russian Ruble', 2, true),
  ('SAR', 'Saudi Riyal', 2, true),
  ('SEK', 'Swedish Krona', 2, true),
  ('SGD', 'Singapore Dollar', 2, true),
  ('THB', 'Thai Baht', 2, true),
  ('TRY', 'Turkish Lira', 2, true),
  ('TWD', 'Taiwan Dollar', 2, true),
  ('USD', 'US Dollar', 2, true),
  ('USDT', 'Tether (USD-pegged stablecoin)', 4, true),
  ('VND', 'Vietnamese Dong', 0, true),
  ('ZAR', 'South African Rand', 2, true)
ON CONFLICT (code) DO NOTHING;

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.currencies ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read the currency registry.
DROP POLICY IF EXISTS "authenticated_select_currencies" ON public.currencies;
CREATE POLICY "authenticated_select_currencies"
  ON public.currencies
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admin users can insert/update/delete currencies.
DROP POLICY IF EXISTS "admin_insert_currencies" ON public.currencies;
CREATE POLICY "admin_insert_currencies"
  ON public.currencies
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "admin_update_currencies" ON public.currencies;
CREATE POLICY "admin_update_currencies"
  ON public.currencies
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "admin_delete_currencies" ON public.currencies;
CREATE POLICY "admin_delete_currencies"
  ON public.currencies
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "service_role_all_currencies" ON public.currencies;
CREATE POLICY "service_role_all_currencies"
  ON public.currencies
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Audit trigger ─────────────────────────────────────────────────────────
SELECT audit.attach_trigger('public.currencies');
