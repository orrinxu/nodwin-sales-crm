-- supabase/policies/ai_providers.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (holds AI provider credentials).
--
-- RLS for public.ai_providers (ORR-635). Also embedded in
-- 20260705060000_ai_providers.sql (self-contained migration); this mirror exists
-- for security-review readability. All ops ADMIN-ONLY so api_key never leaks to
-- non-admins; the server/worker reads via the service-role client.

ALTER TABLE public.ai_providers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_providers_select_admin" ON public.ai_providers;
CREATE POLICY "ai_providers_select_admin" ON public.ai_providers
  FOR SELECT TO authenticated USING (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "ai_providers_insert_admin" ON public.ai_providers;
CREATE POLICY "ai_providers_insert_admin" ON public.ai_providers
  FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "ai_providers_update_admin" ON public.ai_providers;
CREATE POLICY "ai_providers_update_admin" ON public.ai_providers
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin') WITH CHECK (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "ai_providers_delete_admin" ON public.ai_providers;
CREATE POLICY "ai_providers_delete_admin" ON public.ai_providers
  FOR DELETE TO authenticated USING (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "ai_providers_service_role" ON public.ai_providers;
CREATE POLICY "ai_providers_service_role" ON public.ai_providers
  TO service_role USING (true) WITH CHECK (true);
