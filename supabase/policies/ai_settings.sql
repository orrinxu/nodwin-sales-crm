-- supabase/policies/ai_settings.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (holds AI endpoint credentials).
--
-- RLS policies for public.ai_settings (ORR-634). Also embedded in
-- 20260705000000_ai_settings.sql so the migration is self-contained; this file
-- exists for security-review readability.
--
-- SELECT/INSERT/UPDATE/DELETE are ADMIN-ONLY so the embedding/generation API
-- keys never leak to non-admins. The server/worker reads via the service-role
-- client (bypasses RLS) to resolve the actual config.

ALTER TABLE public.ai_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_settings_select_admin" ON public.ai_settings;
CREATE POLICY "ai_settings_select_admin"
  ON public.ai_settings FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "ai_settings_insert_admin" ON public.ai_settings;
CREATE POLICY "ai_settings_insert_admin"
  ON public.ai_settings FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "ai_settings_update_admin" ON public.ai_settings;
CREATE POLICY "ai_settings_update_admin"
  ON public.ai_settings FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "ai_settings_delete_admin" ON public.ai_settings;
CREATE POLICY "ai_settings_delete_admin"
  ON public.ai_settings FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "ai_settings_service_role" ON public.ai_settings;
CREATE POLICY "ai_settings_service_role"
  ON public.ai_settings TO service_role
  USING (true) WITH CHECK (true);
