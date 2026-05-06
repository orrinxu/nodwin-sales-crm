-- supabase/policies/entities.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for the public.entities table.
-- Embedded in 20260505000004_entities_business_units.sql for self-contained migration.
-- This file exists for security-review readability.

ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "entities_select_authenticated" ON public.entities;
CREATE POLICY "entities_select_authenticated"
  ON public.entities
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "entities_insert_admin" ON public.entities;
CREATE POLICY "entities_insert_admin"
  ON public.entities
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "entities_update_admin" ON public.entities;
CREATE POLICY "entities_update_admin"
  ON public.entities
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "entities_delete_admin" ON public.entities;
CREATE POLICY "entities_delete_admin"
  ON public.entities
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
