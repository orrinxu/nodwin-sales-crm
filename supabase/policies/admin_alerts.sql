-- supabase/policies/admin_alerts.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for public.admin_alerts.
-- Embedded in 20260506000003_admin_alerts.sql for self-contained migrations;
-- this file exists for security-review readability.

ALTER TABLE public.admin_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_alerts_select_all_authenticated" ON public.admin_alerts;
CREATE POLICY "admin_alerts_select_all_authenticated"
  ON public.admin_alerts
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "admin_alerts_insert_admin" ON public.admin_alerts;
CREATE POLICY "admin_alerts_insert_admin"
  ON public.admin_alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "admin_alerts_update_admin" ON public.admin_alerts;
CREATE POLICY "admin_alerts_update_admin"
  ON public.admin_alerts
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "admin_alerts_delete_admin" ON public.admin_alerts;
CREATE POLICY "admin_alerts_delete_admin"
  ON public.admin_alerts
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
