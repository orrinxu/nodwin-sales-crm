-- supabase/policies/audit_log.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for the public.audit_log table.
-- These are also embedded in 0002_audit.sql so the migration is self-contained.
-- This file exists for security-review readability.

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Only admins can read audit logs (contains sensitive actor IPs, user agents, old/new values).
DROP POLICY IF EXISTS "audit_log_select_authenticated" ON public.audit_log;
CREATE POLICY "audit_log_select_authenticated"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- Only admins can modify audit_log directly; triggers bypass RLS via SECURITY DEFINER.
DROP POLICY IF EXISTS "audit_log_insert_admin" ON public.audit_log;
CREATE POLICY "audit_log_insert_admin"
  ON public.audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "audit_log_update_admin" ON public.audit_log;
CREATE POLICY "audit_log_update_admin"
  ON public.audit_log
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "audit_log_delete_admin" ON public.audit_log;
CREATE POLICY "audit_log_delete_admin"
  ON public.audit_log
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
