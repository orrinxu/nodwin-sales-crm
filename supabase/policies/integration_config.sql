-- supabase/policies/integration_config.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for integration config tables.
-- These are also embedded in 20260618000003_integration_config.sql so the
-- migration is self-contained.  This file exists for security-review readability.
--
-- Rules:
--   SELECT: all authenticated
--   INSERT: admin only
--   UPDATE: admin only
--   DELETE: admin only
--   service_role: full access

-- ── integration_settings ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "integration_settings_select_auth" ON public.integration_settings;
CREATE POLICY "integration_settings_select_auth"
  ON public.integration_settings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "integration_settings_insert_admin" ON public.integration_settings;
CREATE POLICY "integration_settings_insert_admin"
  ON public.integration_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "integration_settings_update_admin" ON public.integration_settings;
CREATE POLICY "integration_settings_update_admin"
  ON public.integration_settings
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "integration_settings_delete_admin" ON public.integration_settings;
CREATE POLICY "integration_settings_delete_admin"
  ON public.integration_settings
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "integration_settings_service_role" ON public.integration_settings;
CREATE POLICY "integration_settings_service_role"
  ON public.integration_settings
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── slack_connections ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "slack_connections_select_auth" ON public.slack_connections;
CREATE POLICY "slack_connections_select_auth"
  ON public.slack_connections
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "slack_connections_insert_admin" ON public.slack_connections;
CREATE POLICY "slack_connections_insert_admin"
  ON public.slack_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "slack_connections_update_admin" ON public.slack_connections;
CREATE POLICY "slack_connections_update_admin"
  ON public.slack_connections
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "slack_connections_delete_admin" ON public.slack_connections;
CREATE POLICY "slack_connections_delete_admin"
  ON public.slack_connections
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "slack_connections_service_role" ON public.slack_connections;
CREATE POLICY "slack_connections_service_role"
  ON public.slack_connections
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── email_settings ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "email_settings_select_auth" ON public.email_settings;
CREATE POLICY "email_settings_select_auth"
  ON public.email_settings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "email_settings_insert_admin" ON public.email_settings;
CREATE POLICY "email_settings_insert_admin"
  ON public.email_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "email_settings_update_admin" ON public.email_settings;
CREATE POLICY "email_settings_update_admin"
  ON public.email_settings
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "email_settings_delete_admin" ON public.email_settings;
CREATE POLICY "email_settings_delete_admin"
  ON public.email_settings
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "email_settings_service_role" ON public.email_settings;
CREATE POLICY "email_settings_service_role"
  ON public.email_settings
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── salesforce_connections ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "salesforce_connections_select_auth" ON public.salesforce_connections;
CREATE POLICY "salesforce_connections_select_auth"
  ON public.salesforce_connections
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "salesforce_connections_insert_admin" ON public.salesforce_connections;
CREATE POLICY "salesforce_connections_insert_admin"
  ON public.salesforce_connections
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "salesforce_connections_update_admin" ON public.salesforce_connections;
CREATE POLICY "salesforce_connections_update_admin"
  ON public.salesforce_connections
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "salesforce_connections_delete_admin" ON public.salesforce_connections;
CREATE POLICY "salesforce_connections_delete_admin"
  ON public.salesforce_connections
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "salesforce_connections_service_role" ON public.salesforce_connections;
CREATE POLICY "salesforce_connections_service_role"
  ON public.salesforce_connections
  TO service_role
  USING (true)
  WITH CHECK (true);
