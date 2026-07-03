-- supabase/migrations/20260703220000_users_entity_admin_update.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Extends the two-tier admin (ORR-618) to Users & Roles: an Entity Admin may
-- UPDATE users in their OWN entity. This is additive — RLS UPDATE policies are
-- OR'd, so admins_update_all (Super Admin) and users_update_own are unaffected.
--
-- Guardrails (defence in depth):
--   * USING / WITH CHECK confine the entity_admin to primary_entity_id =
--     current_user_entity_id(), and WITH CHECK prevents moving a user OUT of the
--     entity_admin's entity.
--   * The existing prevent_role_escalation trigger still blocks any non-'admin'
--     from changing primary_role or manager_user_id — so an Entity Admin can
--     edit name / business unit / active but CANNOT assign roles or reporting
--     lines, and cannot escalate anyone (incl. themselves) to admin.
--
-- Idempotent: drop-and-recreate.

DROP POLICY IF EXISTS "users_update_entity_admin" ON public.users;
CREATE POLICY "users_update_entity_admin"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (
    public.current_user_role() = 'entity_admin'
    AND primary_entity_id IS NOT NULL
    AND primary_entity_id = public.current_user_entity_id()
  )
  WITH CHECK (
    public.current_user_role() = 'entity_admin'
    AND primary_entity_id IS NOT NULL
    AND primary_entity_id = public.current_user_entity_id()
  );
