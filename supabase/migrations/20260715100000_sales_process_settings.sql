-- supabase/migrations/20260715100000_sales_process_settings.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-753: global sales-process settings (singleton).
--
-- First setting: from which deal stage line items are expected. Reps only need
-- the overall amount early (qualify); by a later stage (e.g. Verbal Agreement)
-- the itemized line items should be filled in. Enforced as a WARNING on the deal
-- page — NOT a hard stage gate. `line_items_override_exempts` controls whether a
-- deal whose amount was manually overridden is waived from the requirement.
--
-- Singleton: a one-row table (id = true), seeded with the feature OFF
-- (required_from_stage NULL). RLS: read = all authenticated (to show the
-- warning); write = admin only.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.sales_process_settings (
  id                             boolean     PRIMARY KEY DEFAULT true CHECK (id),
  -- NULL = feature off. Otherwise a DealStage value.
  line_items_required_from_stage text
    CHECK (
      line_items_required_from_stage IS NULL OR line_items_required_from_stage IN (
        'qualify', 'meet_and_present', 'propose', 'negotiate',
        'verbal_agreement', 'closed_won', 'closed_lost'
      )
    ),
  line_items_override_exempts    boolean     NOT NULL DEFAULT true,
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sales_process_settings IS
  'Global (singleton) sales-process config. Row id is always true.';
COMMENT ON COLUMN public.sales_process_settings.line_items_required_from_stage IS
  'Deal stage from which line items are expected (warning, not a gate). NULL = off.';
COMMENT ON COLUMN public.sales_process_settings.line_items_override_exempts IS
  'When true, a deal with a manually-overridden amount is waived from the line-items requirement.';

-- Seed the singleton (feature off by default).
INSERT INTO public.sales_process_settings (id) VALUES (true)
ON CONFLICT (id) DO NOTHING;

-- ── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_sales_process_settings_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_process_settings_timestamps ON public.sales_process_settings;
CREATE TRIGGER sales_process_settings_timestamps
  BEFORE UPDATE ON public.sales_process_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_sales_process_settings_timestamps();

-- ── Audit ────────────────────────────────────────────────────────────────────
SELECT audit.attach_trigger('public.sales_process_settings');

-- ── Row-level security ───────────────────────────────────────────────────────
ALTER TABLE public.sales_process_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sales_process_settings_select_auth" ON public.sales_process_settings;
CREATE POLICY "sales_process_settings_select_auth"
  ON public.sales_process_settings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "sales_process_settings_insert_admin" ON public.sales_process_settings;
CREATE POLICY "sales_process_settings_insert_admin"
  ON public.sales_process_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "sales_process_settings_update_admin" ON public.sales_process_settings;
CREATE POLICY "sales_process_settings_update_admin"
  ON public.sales_process_settings
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "sales_process_settings_service_role" ON public.sales_process_settings;
CREATE POLICY "sales_process_settings_service_role"
  ON public.sales_process_settings
  TO service_role
  USING (true)
  WITH CHECK (true);
