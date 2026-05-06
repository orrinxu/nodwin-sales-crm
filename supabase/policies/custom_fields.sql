-- supabase/policies/custom_fields.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for the public.field_definitions table.
-- These are also embedded in 20260508000000_custom_fields.sql so the migration is
-- self-contained.  This file exists for security-review readability.
--
-- Rules:
--   SELECT: all authenticated users can read.
--   INSERT: admin only.
--   UPDATE: admin only.
--   DELETE: admin only.

ALTER TABLE public.field_definitions ENABLE ROW LEVEL SECURITY;

-- ── SELECT ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "field_definitions_select_authenticated" ON public.field_definitions;
CREATE POLICY "field_definitions_select_authenticated"
  ON public.field_definitions
  FOR SELECT
  TO authenticated
  USING (true);

-- ── INSERT ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "field_definitions_insert_admin" ON public.field_definitions;
CREATE POLICY "field_definitions_insert_admin"
  ON public.field_definitions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- ── UPDATE ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "field_definitions_update_admin" ON public.field_definitions;
CREATE POLICY "field_definitions_update_admin"
  ON public.field_definitions
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ── DELETE ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "field_definitions_delete_admin" ON public.field_definitions;
CREATE POLICY "field_definitions_delete_admin"
  ON public.field_definitions
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
