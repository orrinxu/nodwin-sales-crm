-- supabase/migrations/20260618000002_financial_settings.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-515 / ORR-505-DB: Financial Settings Schema Migration.
--
-- Creates the four missing admin financial-settings tables from ORR-501 §D:
--   public.reporting_currency_settings  — global / per-entity reporting currency
--   public.fiscal_year_settings         — per-entity FY start month override
--   public.approval_thresholds          — per-entity deal approval rules
--   public.revenue_recognition_defaults — per-entity default split kind & margin
--
-- RLS: read = all authenticated; write = admin only; service_role = full access.
-- Audit: generic audit.attach_trigger() (all tables use uuid PK).
--
-- NOTE: public.currencies and public.fx_rates already exist in prior migrations
-- (20260505000002_currencies.sql and 20260617000000_fx_rates.sql).  No conflict
-- or duplication exists in this workspace.
--
-- Idempotent: safe to re-run.

-- ============================================================================
-- 1. REPORTING CURRENCY SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reporting_currency_settings (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     uuid        REFERENCES public.entities(id) ON DELETE CASCADE,
  currency_code text        NOT NULL REFERENCES public.currencies(code),
  is_default    boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.reporting_currency_settings IS
  'Reporting currency overrides.  NULL entity_id = global default.';

CREATE INDEX IF NOT EXISTS idx_reporting_currency_settings_entity_id
  ON public.reporting_currency_settings(entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_reporting_currency_settings_is_default
  ON public.reporting_currency_settings(is_default)
  WHERE is_default = true;

-- ============================================================================
-- 2. FISCAL YEAR SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fiscal_year_settings (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id      uuid        NOT NULL,
  fy_start_month int         NOT NULL CHECK (fy_start_month BETWEEN 1 AND 12),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_fiscal_year_settings_entity_id
    FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.fiscal_year_settings IS
  'Per-entity fiscal year start month.  Overrides entities.fiscal_year_start_month when set.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conrelid  = 'public.fiscal_year_settings'::regclass
      AND  contype   = 'u'
  ) THEN
    ALTER TABLE public.fiscal_year_settings
      ADD CONSTRAINT fiscal_year_settings_entity_id_key UNIQUE (entity_id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_fiscal_year_settings_entity_id
  ON public.fiscal_year_settings(entity_id);

-- ============================================================================
-- 3. APPROVAL THRESHOLDS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.approval_thresholds (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                  uuid        NOT NULL,
  deal_value_threshold       numeric(20,4) CHECK (deal_value_threshold IS NULL OR deal_value_threshold > 0),
  discount_threshold_pct     numeric(5,2) CHECK (discount_threshold_pct IS NULL OR (discount_threshold_pct >= 0 AND discount_threshold_pct <= 100)),
  confidential_tier_required text,
  approver_role              text        NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_approval_thresholds_entity_id
    FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.approval_thresholds IS
  'Per-entity deal-approval threshold rules.  One row per entity containing all threshold types.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conrelid  = 'public.approval_thresholds'::regclass
      AND  contype   = 'u'
  ) THEN
    ALTER TABLE public.approval_thresholds
      ADD CONSTRAINT approval_thresholds_entity_id_key UNIQUE (entity_id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_approval_thresholds_entity_id
  ON public.approval_thresholds(entity_id);

-- ============================================================================
-- 4. REVENUE RECOGNITION DEFAULTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.revenue_recognition_defaults (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                  uuid        NOT NULL,
  default_split_kind         text        NOT NULL,
  estimated_gross_margin_pct numeric(5,2) CHECK (estimated_gross_margin_pct IS NULL OR (estimated_gross_margin_pct >= 0 AND estimated_gross_margin_pct <= 100)),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_revenue_recognition_defaults_entity_id
    FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.revenue_recognition_defaults IS
  'Per-entity revenue-recognition defaults: split kind and estimated gross-margin %.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conrelid  = 'public.revenue_recognition_defaults'::regclass
      AND  contype   = 'u'
  ) THEN
    ALTER TABLE public.revenue_recognition_defaults
      ADD CONSTRAINT revenue_recognition_defaults_entity_id_key UNIQUE (entity_id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_revenue_recognition_defaults_entity_id
  ON public.revenue_recognition_defaults(entity_id);

-- ============================================================================
-- 5. UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_financial_settings_timestamps()
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

DROP TRIGGER IF EXISTS reporting_currency_settings_timestamps ON public.reporting_currency_settings;
CREATE TRIGGER reporting_currency_settings_timestamps
  BEFORE UPDATE ON public.reporting_currency_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_financial_settings_timestamps();

DROP TRIGGER IF EXISTS fiscal_year_settings_timestamps ON public.fiscal_year_settings;
CREATE TRIGGER fiscal_year_settings_timestamps
  BEFORE UPDATE ON public.fiscal_year_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_financial_settings_timestamps();

DROP TRIGGER IF EXISTS approval_thresholds_timestamps ON public.approval_thresholds;
CREATE TRIGGER approval_thresholds_timestamps
  BEFORE UPDATE ON public.approval_thresholds
  FOR EACH ROW EXECUTE FUNCTION public.set_financial_settings_timestamps();

DROP TRIGGER IF EXISTS revenue_recognition_defaults_timestamps ON public.revenue_recognition_defaults;
CREATE TRIGGER revenue_recognition_defaults_timestamps
  BEFORE UPDATE ON public.revenue_recognition_defaults
  FOR EACH ROW EXECUTE FUNCTION public.set_financial_settings_timestamps();

-- ============================================================================
-- 6. AUDIT LOG
-- ============================================================================

SELECT audit.attach_trigger('public.reporting_currency_settings');
SELECT audit.attach_trigger('public.fiscal_year_settings');
SELECT audit.attach_trigger('public.approval_thresholds');
SELECT audit.attach_trigger('public.revenue_recognition_defaults');

-- ============================================================================
-- 7. ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.reporting_currency_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_year_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_thresholds         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_recognition_defaults ENABLE ROW LEVEL SECURITY;

-- ── reporting_currency_settings ─────────────────────────────────────────────

DROP POLICY IF EXISTS "reporting_currency_settings_select_auth" ON public.reporting_currency_settings;
CREATE POLICY "reporting_currency_settings_select_auth"
  ON public.reporting_currency_settings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "reporting_currency_settings_insert_admin" ON public.reporting_currency_settings;
CREATE POLICY "reporting_currency_settings_insert_admin"
  ON public.reporting_currency_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "reporting_currency_settings_update_admin" ON public.reporting_currency_settings;
CREATE POLICY "reporting_currency_settings_update_admin"
  ON public.reporting_currency_settings
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "reporting_currency_settings_delete_admin" ON public.reporting_currency_settings;
CREATE POLICY "reporting_currency_settings_delete_admin"
  ON public.reporting_currency_settings
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "reporting_currency_settings_service_role" ON public.reporting_currency_settings;
CREATE POLICY "reporting_currency_settings_service_role"
  ON public.reporting_currency_settings
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── fiscal_year_settings ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "fiscal_year_settings_select_auth" ON public.fiscal_year_settings;
CREATE POLICY "fiscal_year_settings_select_auth"
  ON public.fiscal_year_settings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "fiscal_year_settings_insert_admin" ON public.fiscal_year_settings;
CREATE POLICY "fiscal_year_settings_insert_admin"
  ON public.fiscal_year_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "fiscal_year_settings_update_admin" ON public.fiscal_year_settings;
CREATE POLICY "fiscal_year_settings_update_admin"
  ON public.fiscal_year_settings
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "fiscal_year_settings_delete_admin" ON public.fiscal_year_settings;
CREATE POLICY "fiscal_year_settings_delete_admin"
  ON public.fiscal_year_settings
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "fiscal_year_settings_service_role" ON public.fiscal_year_settings;
CREATE POLICY "fiscal_year_settings_service_role"
  ON public.fiscal_year_settings
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── approval_thresholds ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "approval_thresholds_select_auth" ON public.approval_thresholds;
CREATE POLICY "approval_thresholds_select_auth"
  ON public.approval_thresholds
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "approval_thresholds_insert_admin" ON public.approval_thresholds;
CREATE POLICY "approval_thresholds_insert_admin"
  ON public.approval_thresholds
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "approval_thresholds_update_admin" ON public.approval_thresholds;
CREATE POLICY "approval_thresholds_update_admin"
  ON public.approval_thresholds
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "approval_thresholds_delete_admin" ON public.approval_thresholds;
CREATE POLICY "approval_thresholds_delete_admin"
  ON public.approval_thresholds
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "approval_thresholds_service_role" ON public.approval_thresholds;
CREATE POLICY "approval_thresholds_service_role"
  ON public.approval_thresholds
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── revenue_recognition_defaults ────────────────────────────────────────────

DROP POLICY IF EXISTS "revenue_recognition_defaults_select_auth" ON public.revenue_recognition_defaults;
CREATE POLICY "revenue_recognition_defaults_select_auth"
  ON public.revenue_recognition_defaults
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "revenue_recognition_defaults_insert_admin" ON public.revenue_recognition_defaults;
CREATE POLICY "revenue_recognition_defaults_insert_admin"
  ON public.revenue_recognition_defaults
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "revenue_recognition_defaults_update_admin" ON public.revenue_recognition_defaults;
CREATE POLICY "revenue_recognition_defaults_update_admin"
  ON public.revenue_recognition_defaults
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "revenue_recognition_defaults_delete_admin" ON public.revenue_recognition_defaults;
CREATE POLICY "revenue_recognition_defaults_delete_admin"
  ON public.revenue_recognition_defaults
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "revenue_recognition_defaults_service_role" ON public.revenue_recognition_defaults;
CREATE POLICY "revenue_recognition_defaults_service_role"
  ON public.revenue_recognition_defaults
  TO service_role
  USING (true)
  WITH CHECK (true);
