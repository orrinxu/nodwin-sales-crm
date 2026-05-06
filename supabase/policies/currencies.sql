-- supabase/policies/currencies.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for the public.currencies table (created in 0017_currencies.sql).
--
-- Policies:
--   • authenticated_select_currencies — all authenticated users can read
--   • admin_insert_currencies         — only admin users can insert
--   • admin_update_currencies         — only admin users can update
--   • admin_delete_currencies         — only admin users can delete
--   • service_role_all_currencies     — service_role has full access
--
-- Idempotent: safe to re-run.

-- ── Select ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "authenticated_select_currencies" ON public.currencies;
CREATE POLICY "authenticated_select_currencies"
  ON public.currencies
  FOR SELECT
  TO authenticated
  USING (true);

-- ── Insert ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_insert_currencies" ON public.currencies;
CREATE POLICY "admin_insert_currencies"
  ON public.currencies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND primary_role = 'admin')
  );

-- ── Update ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_update_currencies" ON public.currencies;
CREATE POLICY "admin_update_currencies"
  ON public.currencies
  FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND primary_role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND primary_role = 'admin'));

-- ── Delete ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_delete_currencies" ON public.currencies;
CREATE POLICY "admin_delete_currencies"
  ON public.currencies
  FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND primary_role = 'admin'));

-- ── Service role ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "service_role_all_currencies" ON public.currencies;
CREATE POLICY "service_role_all_currencies"
  ON public.currencies
  TO service_role
  USING (true)
  WITH CHECK (true);
