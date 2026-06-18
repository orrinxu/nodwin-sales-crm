-- supabase/policies/relationship_types.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for the public.relationship_types lookup table.
-- Embedded in 20260618000001_entity_branding_relationship_types.sql for self-contained migration.
-- This file exists for security-review readability.

ALTER TABLE public.relationship_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "relationship_types_select_authenticated" ON public.relationship_types;
CREATE POLICY "relationship_types_select_authenticated"
  ON public.relationship_types
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "relationship_types_insert_admin" ON public.relationship_types;
CREATE POLICY "relationship_types_insert_admin"
  ON public.relationship_types
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "relationship_types_update_admin" ON public.relationship_types;
CREATE POLICY "relationship_types_update_admin"
  ON public.relationship_types
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "relationship_types_delete_admin" ON public.relationship_types;
CREATE POLICY "relationship_types_delete_admin"
  ON public.relationship_types
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
