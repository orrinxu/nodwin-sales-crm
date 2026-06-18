-- supabase/policies/data_management.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for Data Management tables (ORR-527 / ORR-509-db).
-- These are also embedded in 20260620000000_data_management.sql so the
-- migration is self-contained. This file exists for security-review readability.
--
-- Rules:
--   finance_export_config:
--     SELECT: all authenticated
--     INSERT: admin only
--     UPDATE: admin only
--     DELETE: admin only
--     service_role: full access
--   import_jobs:
--     SELECT: own records (all authenticated) | all (admin)
--     INSERT: admin only
--     UPDATE: service_role only
--     service_role: full access

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
