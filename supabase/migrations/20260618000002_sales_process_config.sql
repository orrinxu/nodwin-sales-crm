-- supabase/migrations/20260618000002_sales_process_config.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Schema for Admin C: Sales Process Configuration.
-- Creates lookup tables for pipeline stages, loss reasons, project types,
-- revenue categories, and stage-gate rules.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. pipeline_stages — admin-configurable stage metadata
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key             text        NOT NULL UNIQUE,
  label           text        NOT NULL,
  win_probability integer     CHECK (win_probability >= 0 AND win_probability <= 100),
  is_won          boolean     NOT NULL DEFAULT false,
  is_lost         boolean     NOT NULL DEFAULT false,
  sort_order      int         NOT NULL DEFAULT 0,
  active          boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.pipeline_stages IS
  'Admin-configurable pipeline stage metadata (labels, win probability, won/lost designation).';

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_active_sort
  ON public.pipeline_stages (sort_order)
  WHERE active = true;

-- Seed current deal_stage enum values
INSERT INTO public.pipeline_stages (key, label, win_probability, is_won, is_lost, sort_order, active) VALUES
  ('qualify', 'Qualify', 10, false, false, 0, true),
  ('meet_and_present', 'Meet & Present', 20, false, false, 1, true),
  ('propose', 'Propose', 40, false, false, 2, true),
  ('negotiate', 'Negotiate', 60, false, false, 3, true),
  ('verbal_agreement', 'Verbal Agreement', 80, false, false, 4, true),
  ('closed_won', 'Closed Won', 100, true, false, 5, true),
  ('closed_lost', 'Closed Lost', 0, false, true, 6, true)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  win_probability = EXCLUDED.win_probability,
  is_won = EXCLUDED.is_won,
  is_lost = EXCLUDED.is_lost,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. loss_reasons — admin-configurable picklist for closed_lost
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.loss_reasons (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label       text        NOT NULL,
  sort_order  int         NOT NULL DEFAULT 0,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.loss_reasons IS
  'Admin-configurable loss reason picklist required when a deal is closed_lost.';

CREATE INDEX IF NOT EXISTS idx_loss_reasons_active_sort
  ON public.loss_reasons (sort_order)
  WHERE active = true;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. project_types — admin-configurable picklist (v1 metadata; v2 may replace enum)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.project_types (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        NOT NULL UNIQUE,
  label       text        NOT NULL,
  sort_order  int         NOT NULL DEFAULT 0,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.project_types IS
  'Admin-configurable project type list (SOW §4.3).';

CREATE INDEX IF NOT EXISTS idx_project_types_active_sort
  ON public.project_types (sort_order)
  WHERE active = true;

INSERT INTO public.project_types (key, label, sort_order, active) VALUES
  ('ip', 'IP', 0, true),
  ('white_label', 'White Label', 1, true),
  ('media_rights', 'Media Rights', 2, true),
  ('d2c_retail', 'D2C Retail', 3, true),
  ('d2c_pins', 'D2C Pins', 4, true),
  ('d2c_touring', 'D2C Touring', 5, true),
  ('consulting_tech', 'Consulting — Tech', 6, true),
  ('consulting_ideas', 'Consulting — Ideas', 7, true),
  ('talent_management', 'Talent Management', 8, true),
  ('pr_services', 'PR Services', 9, true),
  ('other', 'Other', 10, true)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. revenue_categories — admin-configurable picklist (v1 metadata; v2 may replace enum)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.revenue_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        NOT NULL UNIQUE,
  label       text        NOT NULL,
  sort_order  int         NOT NULL DEFAULT 0,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.revenue_categories IS
  'Admin-configurable revenue category list (live | content, SOW §4.3).';

CREATE INDEX IF NOT EXISTS idx_revenue_categories_active_sort
  ON public.revenue_categories (sort_order)
  WHERE active = true;

INSERT INTO public.revenue_categories (key, label, sort_order, active) VALUES
  ('live', 'Live', 0, true),
  ('content', 'Content', 1, true)
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  sort_order = EXCLUDED.sort_order,
  active = EXCLUDED.active;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. stage_gate_rules — mandatory fields per stage
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.stage_gate_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_key   text        NOT NULL REFERENCES public.pipeline_stages(key) ON DELETE CASCADE,
  entity_type public.field_entity_type NOT NULL,
  field_key   text        NOT NULL,
  required    boolean     NOT NULL DEFAULT true,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stage_key, entity_type, field_key)
);

COMMENT ON TABLE public.stage_gate_rules IS
  'Configures which fields are mandatory to advance to a given stage (e.g. execution_date required before Verbal Agreement).';

CREATE INDEX IF NOT EXISTS idx_stage_gate_rules_stage
  ON public.stage_gate_rules (stage_key)
  WHERE active = true;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Audit fields triggers
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_sales_process_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.updated_at := COALESCE(NEW.updated_at, now());
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pipeline_stages_audit_trigger ON public.pipeline_stages;
CREATE TRIGGER pipeline_stages_audit_trigger
  BEFORE INSERT OR UPDATE ON public.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_sales_process_audit_fields();

DROP TRIGGER IF EXISTS loss_reasons_audit_trigger ON public.loss_reasons;
CREATE TRIGGER loss_reasons_audit_trigger
  BEFORE INSERT OR UPDATE ON public.loss_reasons
  FOR EACH ROW EXECUTE FUNCTION public.set_sales_process_audit_fields();

DROP TRIGGER IF EXISTS project_types_audit_trigger ON public.project_types;
CREATE TRIGGER project_types_audit_trigger
  BEFORE INSERT OR UPDATE ON public.project_types
  FOR EACH ROW EXECUTE FUNCTION public.set_sales_process_audit_fields();

DROP TRIGGER IF EXISTS revenue_categories_audit_trigger ON public.revenue_categories;
CREATE TRIGGER revenue_categories_audit_trigger
  BEFORE INSERT OR UPDATE ON public.revenue_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_sales_process_audit_fields();

DROP TRIGGER IF EXISTS stage_gate_rules_audit_trigger ON public.stage_gate_rules;
CREATE TRIGGER stage_gate_rules_audit_trigger
  BEFORE INSERT OR UPDATE ON public.stage_gate_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_sales_process_audit_fields();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. Audit log triggers
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT audit.attach_trigger('public.pipeline_stages');
SELECT audit.attach_trigger('public.loss_reasons');
SELECT audit.attach_trigger('public.project_types');
SELECT audit.attach_trigger('public.revenue_categories');
SELECT audit.attach_trigger('public.stage_gate_rules');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. RLS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loss_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stage_gate_rules ENABLE ROW LEVEL SECURITY;

-- SELECT: all authenticated users can read lookup tables.
DROP POLICY IF EXISTS "pipeline_stages_select_authenticated" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages_select_authenticated"
  ON public.pipeline_stages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "loss_reasons_select_authenticated" ON public.loss_reasons;
CREATE POLICY "loss_reasons_select_authenticated"
  ON public.loss_reasons FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "project_types_select_authenticated" ON public.project_types;
CREATE POLICY "project_types_select_authenticated"
  ON public.project_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "revenue_categories_select_authenticated" ON public.revenue_categories;
CREATE POLICY "revenue_categories_select_authenticated"
  ON public.revenue_categories FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "stage_gate_rules_select_authenticated" ON public.stage_gate_rules;
CREATE POLICY "stage_gate_rules_select_authenticated"
  ON public.stage_gate_rules FOR SELECT TO authenticated USING (true);

-- INSERT: admin only.
DROP POLICY IF EXISTS "pipeline_stages_insert_admin" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages_insert_admin"
  ON public.pipeline_stages FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "loss_reasons_insert_admin" ON public.loss_reasons;
CREATE POLICY "loss_reasons_insert_admin"
  ON public.loss_reasons FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "project_types_insert_admin" ON public.project_types;
CREATE POLICY "project_types_insert_admin"
  ON public.project_types FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "revenue_categories_insert_admin" ON public.revenue_categories;
CREATE POLICY "revenue_categories_insert_admin"
  ON public.revenue_categories FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "stage_gate_rules_insert_admin" ON public.stage_gate_rules;
CREATE POLICY "stage_gate_rules_insert_admin"
  ON public.stage_gate_rules FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- UPDATE: admin only.
DROP POLICY IF EXISTS "pipeline_stages_update_admin" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages_update_admin"
  ON public.pipeline_stages FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "loss_reasons_update_admin" ON public.loss_reasons;
CREATE POLICY "loss_reasons_update_admin"
  ON public.loss_reasons FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "project_types_update_admin" ON public.project_types;
CREATE POLICY "project_types_update_admin"
  ON public.project_types FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "revenue_categories_update_admin" ON public.revenue_categories;
CREATE POLICY "revenue_categories_update_admin"
  ON public.revenue_categories FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "stage_gate_rules_update_admin" ON public.stage_gate_rules;
CREATE POLICY "stage_gate_rules_update_admin"
  ON public.stage_gate_rules FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- DELETE: admin only.
DROP POLICY IF EXISTS "pipeline_stages_delete_admin" ON public.pipeline_stages;
CREATE POLICY "pipeline_stages_delete_admin"
  ON public.pipeline_stages FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "loss_reasons_delete_admin" ON public.loss_reasons;
CREATE POLICY "loss_reasons_delete_admin"
  ON public.loss_reasons FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "project_types_delete_admin" ON public.project_types;
CREATE POLICY "project_types_delete_admin"
  ON public.project_types FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "revenue_categories_delete_admin" ON public.revenue_categories;
CREATE POLICY "revenue_categories_delete_admin"
  ON public.revenue_categories FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "stage_gate_rules_delete_admin" ON public.stage_gate_rules;
CREATE POLICY "stage_gate_rules_delete_admin"
  ON public.stage_gate_rules FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');
