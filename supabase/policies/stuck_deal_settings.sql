-- supabase/policies/stuck_deal_settings.sql
--
-- RLS for public.stuck_deal_settings (ORR-103). Also embedded in
-- 20260705070000_stuck_deal_settings.sql (self-contained migration); this mirror
-- exists for security-review readability. All ops ADMIN-ONLY; the widget reads
-- the resolved thresholds via the service-role client.

ALTER TABLE public.stuck_deal_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stuck_deal_settings_select_admin" ON public.stuck_deal_settings;
CREATE POLICY "stuck_deal_settings_select_admin" ON public.stuck_deal_settings
  FOR SELECT TO authenticated USING (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "stuck_deal_settings_insert_admin" ON public.stuck_deal_settings;
CREATE POLICY "stuck_deal_settings_insert_admin" ON public.stuck_deal_settings
  FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "stuck_deal_settings_update_admin" ON public.stuck_deal_settings;
CREATE POLICY "stuck_deal_settings_update_admin" ON public.stuck_deal_settings
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin') WITH CHECK (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "stuck_deal_settings_delete_admin" ON public.stuck_deal_settings;
CREATE POLICY "stuck_deal_settings_delete_admin" ON public.stuck_deal_settings
  FOR DELETE TO authenticated USING (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "stuck_deal_settings_service_role" ON public.stuck_deal_settings;
CREATE POLICY "stuck_deal_settings_service_role" ON public.stuck_deal_settings
  TO service_role USING (true) WITH CHECK (true);
