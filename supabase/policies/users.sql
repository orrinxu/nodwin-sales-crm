-- supabase/policies/users.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for the public.users table.
-- These are also embedded in 0004_users.sql so the migration is self-contained.
-- This file exists for security-review readability.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_self_and_same_entity" ON public.users;
CREATE POLICY "users_select_self_and_same_entity"
  ON public.users
  FOR SELECT
  TO authenticated
  USING (
    id = auth.uid()
    OR (
      primary_entity_id IS NOT NULL
      AND primary_entity_id = public.current_user_entity_id()
    )
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "admins_update_all" ON public.users;
CREATE POLICY "admins_update_all"
  ON public.users
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "admins_insert" ON public.users;
CREATE POLICY "admins_insert"
  ON public.users
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "admins_delete" ON public.users;
CREATE POLICY "admins_delete"
  ON public.users
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
