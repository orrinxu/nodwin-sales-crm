-- supabase/policies/ai_settings.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for the public.ai_settings table.
-- These are also embedded in 20260705000000_ai_settings.sql so the migration is
-- self-contained.  This file exists for security-review readability.
--
-- Rules:
--   SELECT: all authenticated users can read AI settings.
--   INSERT: admin only.
--   UPDATE: admin only.
--   DELETE: admin only.
--   SERVICE: service_role bypass.

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

-- ── SELECT ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ai_settings_select_authenticated" ON public.ai_settings;
CREATE POLICY "ai_settings_select_authenticated"
  ON public.ai_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- ── INSERT ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ai_settings_insert_admin" ON public.ai_settings;
CREATE POLICY "ai_settings_insert_admin"
  ON public.ai_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- ── UPDATE ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ai_settings_update_admin" ON public.ai_settings;
CREATE POLICY "ai_settings_update_admin"
  ON public.ai_settings
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- ── DELETE ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "ai_settings_delete_admin" ON public.ai_settings;
CREATE POLICY "ai_settings_delete_admin"
  ON public.ai_settings
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ── Service role bypass ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "service_role_all_ai_settings" ON public.ai_settings;
CREATE POLICY "service_role_all_ai_settings"
  ON public.ai_settings
  TO service_role
  USING (true)
  WITH CHECK (true);
