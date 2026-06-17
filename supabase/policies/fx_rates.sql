-- supabase/policies/fx_rates.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for the public.fx_rates table (created in 20260617000000_fx_rates.sql).
--
-- Policies:
--   • authenticated_select_fx_rates  — all authenticated users can read
--   • finance_admin_insert_fx_rates  — finance and admin can insert
--   • finance_admin_update_fx_rates  — finance and admin can update
--   • finance_admin_delete_fx_rates  — finance and admin can delete
--   • service_role_all_fx_rates      — service_role has full access
--
-- Idempotent: safe to re-run.

-- ── Select ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "authenticated_select_fx_rates" ON public.fx_rates;
CREATE POLICY "authenticated_select_fx_rates"
  ON public.fx_rates
  FOR SELECT
  TO authenticated
  USING (true);

-- ── Insert ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "finance_admin_insert_fx_rates" ON public.fx_rates;
CREATE POLICY "finance_admin_insert_fx_rates"
  ON public.fx_rates
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() IN ('finance', 'admin'));

-- ── Update ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "finance_admin_update_fx_rates" ON public.fx_rates;
CREATE POLICY "finance_admin_update_fx_rates"
  ON public.fx_rates
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() IN ('finance', 'admin'))
  WITH CHECK (public.current_user_role() IN ('finance', 'admin'));

-- ── Delete ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "finance_admin_delete_fx_rates" ON public.fx_rates;
CREATE POLICY "finance_admin_delete_fx_rates"
  ON public.fx_rates
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() IN ('finance', 'admin'));

-- ── Service role ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "service_role_all_fx_rates" ON public.fx_rates;
CREATE POLICY "service_role_all_fx_rates"
  ON public.fx_rates
  TO service_role
  USING (true)
  WITH CHECK (true);
