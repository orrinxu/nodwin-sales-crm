-- supabase/migrations/20260619000002_data_management.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-527 / ORR-509-db: Data Management schema migration.
--
-- Creates:
--   • Table: finance_export_config — per-entity daily export configuration
--   • Table: import_jobs — import/export job history
--   • RLS, audit, and updated_at triggers
--
-- Idempotent: safe to re-run.

-- ============================================================================
-- 1. FINANCE EXPORT CONFIG
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.finance_export_config (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id                   uuid        NOT NULL UNIQUE REFERENCES public.entities(id) ON DELETE CASCADE,
  destination_drive_folder_id text,
  format                      jsonb       NOT NULL DEFAULT '{}',
  schedule                    text,
  enabled                     boolean     NOT NULL DEFAULT false,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_export_config_entity_id
  ON public.finance_export_config(entity_id);

COMMENT ON TABLE public.finance_export_config IS
  'Per-entity daily finance export configuration. Controls destination Drive folder, output format, and schedule.';
COMMENT ON COLUMN public.finance_export_config.format IS
  'JSONB: output format configuration matching the Salesforce Finance feed structure.';
COMMENT ON COLUMN public.finance_export_config.schedule IS
  'Cron or schedule expression controlling when the daily export runs.';

-- ============================================================================
-- 2. IMPORT JOBS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.import_jobs (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id          uuid        REFERENCES public.entities(id) ON DELETE SET NULL,
  kind               text        NOT NULL CHECK (kind IN ('export', 'import')),
  target_entity_type text,
  status             text        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  file_url           text,
  drive_file_id      text,
  record_count       integer,
  error_log          jsonb,
  created_by         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_import_jobs_entity_id
  ON public.import_jobs(entity_id);
CREATE INDEX IF NOT EXISTS idx_import_jobs_status
  ON public.import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_import_jobs_kind
  ON public.import_jobs(kind);
CREATE INDEX IF NOT EXISTS idx_import_jobs_created_by
  ON public.import_jobs(created_by);

COMMENT ON TABLE public.import_jobs IS
  'Import/export job history. Tracks CSV exports of any entity and import operations with status and metadata.';
COMMENT ON COLUMN public.import_jobs.kind IS
  'Whether this job is an export or import.';
COMMENT ON COLUMN public.import_jobs.target_entity_type IS
  'The CRM entity type being exported/imported (e.g. accounts, contacts, opportunities).';
COMMENT ON COLUMN public.import_jobs.error_log IS
  'JSONB: error details if the job failed.';

-- ============================================================================
-- 3. UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_data_management_timestamps()
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

DROP TRIGGER IF EXISTS finance_export_config_timestamps ON public.finance_export_config;
CREATE TRIGGER finance_export_config_timestamps
  BEFORE UPDATE ON public.finance_export_config
  FOR EACH ROW EXECUTE FUNCTION public.set_data_management_timestamps();

DROP TRIGGER IF EXISTS import_jobs_timestamps ON public.import_jobs;
CREATE TRIGGER import_jobs_timestamps
  BEFORE UPDATE ON public.import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_data_management_timestamps();

-- ============================================================================
-- 4. AUDIT LOG
-- ============================================================================

SELECT audit.attach_trigger('public.finance_export_config');
SELECT audit.attach_trigger('public.import_jobs');

-- ============================================================================
-- 5. ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.finance_export_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs            ENABLE ROW LEVEL SECURITY;

-- ── finance_export_config ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "finance_export_config_select_auth" ON public.finance_export_config;
CREATE POLICY "finance_export_config_select_auth"
  ON public.finance_export_config
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "finance_export_config_insert_admin" ON public.finance_export_config;
CREATE POLICY "finance_export_config_insert_admin"
  ON public.finance_export_config
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "finance_export_config_update_admin" ON public.finance_export_config;
CREATE POLICY "finance_export_config_update_admin"
  ON public.finance_export_config
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "finance_export_config_delete_admin" ON public.finance_export_config;
CREATE POLICY "finance_export_config_delete_admin"
  ON public.finance_export_config
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "finance_export_config_service_role" ON public.finance_export_config;
CREATE POLICY "finance_export_config_service_role"
  ON public.finance_export_config
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── import_jobs ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "import_jobs_select_own" ON public.import_jobs;
CREATE POLICY "import_jobs_select_own"
  ON public.import_jobs
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "import_jobs_select_admin" ON public.import_jobs;
CREATE POLICY "import_jobs_select_admin"
  ON public.import_jobs
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "import_jobs_insert_admin" ON public.import_jobs;
CREATE POLICY "import_jobs_insert_admin"
  ON public.import_jobs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "import_jobs_update_service_role" ON public.import_jobs;
CREATE POLICY "import_jobs_update_service_role"
  ON public.import_jobs
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "import_jobs_service_role_all" ON public.import_jobs;
CREATE POLICY "import_jobs_service_role_all"
  ON public.import_jobs
  TO service_role
  USING (true)
  WITH CHECK (true);
