-- supabase/policies/file_type_categories.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for the public.file_type_categories table (ORR-659).
-- Also embedded in the migration 20260710000000_file_type_categories.sql so it is
-- self-contained. This file exists for security-review readability.
--
-- Rules:
--   SELECT: all authenticated users can read.
--   INSERT: admin only.
--   UPDATE: admin only.
--   DELETE: admin only.
--   service_role: full access.

ALTER TABLE public.file_type_categories ENABLE ROW LEVEL SECURITY;

-- ── SELECT ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "file_type_categories_select_authenticated" ON public.file_type_categories;
CREATE POLICY "file_type_categories_select_authenticated"
  ON public.file_type_categories
  FOR SELECT
  TO authenticated
  USING (true);

-- ── INSERT ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "file_type_categories_insert_admin" ON public.file_type_categories;
CREATE POLICY "file_type_categories_insert_admin"
  ON public.file_type_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- ── UPDATE ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "file_type_categories_update_admin" ON public.file_type_categories;
CREATE POLICY "file_type_categories_update_admin"
  ON public.file_type_categories
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ── DELETE ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "file_type_categories_delete_admin" ON public.file_type_categories;
CREATE POLICY "file_type_categories_delete_admin"
  ON public.file_type_categories
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ── Service role ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "file_type_categories_service_role_all" ON public.file_type_categories;
CREATE POLICY "file_type_categories_service_role_all"
  ON public.file_type_categories
  TO service_role
  USING (true)
  WITH CHECK (true);
