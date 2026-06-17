-- supabase/migrations/20260617000000_fx_rates.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-458 / FX-1: FX rates table for multi-entity currency conversion.
--
-- Finance and admin users manage exchange rates per currency pair,
-- optionally scoped to a specific legal entity.  A null entity_id
-- denotes a group-wide default rate that entities without their own
-- entry inherit.
--
-- Provides:
--   • Table    public.fx_rates
--   • Indexes  for currency-pair lookups and effective-date range queries
--   • RLS      select by all authenticated; write by finance / admin
--   • Audit    trigger via audit.attach_trigger
--
-- Idempotent: safe to re-run.

-- ── Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fx_rates (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency     text        NOT NULL REFERENCES public.currencies(code),
  to_currency       text        NOT NULL REFERENCES public.currencies(code),
  rate              numeric(20,8) NOT NULL CHECK (rate > 0),
  source            text        NOT NULL CHECK (source IN ('manual', 'external_api')),
  source_reference  text,
  effective_date    date        NOT NULL DEFAULT CURRENT_DATE,
  entity_id         uuid        REFERENCES public.entities(id) ON DELETE CASCADE,
  created_by        uuid        REFERENCES public.users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fx_rates_different_currencies CHECK (from_currency <> to_currency)
);

COMMENT ON TABLE public.fx_rates IS
  'Exchange rates for converting deal amounts between currencies.  Finance-managed.';

COMMENT ON COLUMN public.fx_rates.rate IS
  'How many units of to_currency equal 1 unit of from_currency.';
COMMENT ON COLUMN public.fx_rates.source IS
  'manual = entered by finance/admin; external_api = fetched from an external provider.';
COMMENT ON COLUMN public.fx_rates.source_reference IS
  'Provider name, URL, or audit note about where the rate came from.';
COMMENT ON COLUMN public.fx_rates.entity_id IS
  'If set, this rate is entity-specific.  NULL = group-wide default for the currency pair.';

-- ── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fx_rates_currency_pair
  ON public.fx_rates (from_currency, to_currency);

CREATE INDEX IF NOT EXISTS idx_fx_rates_effective_date
  ON public.fx_rates (effective_date DESC);

CREATE INDEX IF NOT EXISTS idx_fx_rates_entity_id
  ON public.fx_rates (entity_id)
  WHERE entity_id IS NOT NULL;

-- Lookup index for the "latest rate for a pair" query used by the app.
CREATE INDEX IF NOT EXISTS idx_fx_rates_latest_pair
  ON public.fx_rates (from_currency, to_currency, effective_date DESC);

-- ── Unique constraint ──────────────────────────────────────────────────────
-- One rate per currency pair, effective date, and entity scope.
-- Uses NULLS NOT DISTINCT so two rows with entity_id = NULL do not collide
-- unless they also share the same from/to/date.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fx_rates_unique_rate'
  ) THEN
    ALTER TABLE public.fx_rates
      ADD CONSTRAINT fx_rates_unique_rate
      UNIQUE NULLS NOT DISTINCT (from_currency, to_currency, effective_date, entity_id);
  END IF;
END;
$$;

-- ── Trigger: updated_at ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_fx_rates_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fx_rates_updated_at_trigger ON public.fx_rates;
CREATE TRIGGER fx_rates_updated_at_trigger
  BEFORE UPDATE ON public.fx_rates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_fx_rates_updated_at();

-- ── Audit log ──────────────────────────────────────────────────────────────

SELECT audit.attach_trigger('public.fx_rates');

-- ── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read FX rates.
DROP POLICY IF EXISTS "authenticated_select_fx_rates" ON public.fx_rates;
CREATE POLICY "authenticated_select_fx_rates"
  ON public.fx_rates
  FOR SELECT
  TO authenticated
  USING (true);

-- Only finance and admin users can insert FX rates.
DROP POLICY IF EXISTS "finance_admin_insert_fx_rates" ON public.fx_rates;
CREATE POLICY "finance_admin_insert_fx_rates"
  ON public.fx_rates
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('finance', 'admin'));

-- Only finance and admin users can update FX rates.
DROP POLICY IF EXISTS "finance_admin_update_fx_rates" ON public.fx_rates;
CREATE POLICY "finance_admin_update_fx_rates"
  ON public.fx_rates
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() IN ('finance', 'admin'))
  WITH CHECK (public.current_user_role() IN ('finance', 'admin'));

-- Only finance and admin users can delete FX rates.
DROP POLICY IF EXISTS "finance_admin_delete_fx_rates" ON public.fx_rates;
CREATE POLICY "finance_admin_delete_fx_rates"
  ON public.fx_rates
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() IN ('finance', 'admin'));

-- Service role has full access.
DROP POLICY IF EXISTS "service_role_all_fx_rates" ON public.fx_rates;
CREATE POLICY "service_role_all_fx_rates"
  ON public.fx_rates
  TO service_role
  USING (true)
  WITH CHECK (true);
