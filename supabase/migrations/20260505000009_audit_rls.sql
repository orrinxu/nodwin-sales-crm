-- supabase/migrations/20260505000009_audit_rls.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Audit log Row Level Security policies.
-- Split from 0002_audit.sql because these policies depend on
-- public.current_user_role() which is defined in 20260505000000_users.sql.
--
-- Idempotent: safe to re-run.

-- ── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read audit logs (needed for record history).
DROP POLICY IF EXISTS "audit_log_select_authenticated" ON public.audit_log;
CREATE POLICY "audit_log_select_authenticated"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

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
