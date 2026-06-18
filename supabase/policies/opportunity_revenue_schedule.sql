-- supabase/policies/opportunity_revenue_schedule.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for public.opportunity_revenue_schedule (created in 20260618000000_opportunity_revenue_schedule.sql).
--
-- Policies:
--   • opportunity_revenue_schedule_select_via_visibility  — user can view rows iff they can see the parent opportunity
--   • opportunity_revenue_schedule_insert_via_visibility  — user can insert rows iff they own or initiated the parent opportunity
--   • opportunity_revenue_schedule_update_via_visibility  — user can update rows iff they own the parent opportunity, are an admin/team lead, or team member (owner|contributor)
--   • opportunity_revenue_schedule_delete_via_visibility  — admin only
--   • service_role_all_opportunity_revenue_schedule       — service_role has full access
--
-- Idempotent: safe to re-run.

-- ── Select ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "opportunity_revenue_schedule_select_via_visibility" ON public.opportunity_revenue_schedule;
CREATE POLICY "opportunity_revenue_schedule_select_via_visibility"
  ON public.opportunity_revenue_schedule
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunity_revenue_schedule.opportunity_id
        AND user_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  );

-- ── Insert ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "opportunity_revenue_schedule_insert_via_visibility" ON public.opportunity_revenue_schedule;
CREATE POLICY "opportunity_revenue_schedule_insert_via_visibility"
  ON public.opportunity_revenue_schedule
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.opportunities
      WHERE id = public.opportunity_revenue_schedule.opportunity_id
        AND (
          owner_user_id = auth.uid()
          OR sales_initiator_user_id = auth.uid()
        )
    )
    OR public.current_user_role() IN ('admin', 'group_sales_lead')
  );

-- ── Update ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "opportunity_revenue_schedule_update_via_visibility" ON public.opportunity_revenue_schedule;
CREATE POLICY "opportunity_revenue_schedule_update_via_visibility"
  ON public.opportunity_revenue_schedule
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunities
      WHERE id = public.opportunity_revenue_schedule.opportunity_id
        AND owner_user_id = auth.uid()
    )
    OR public.current_user_role() IN ('admin', 'group_sales_lead')
    OR EXISTS (
      SELECT 1 FROM public.opportunity_team_members
      WHERE opportunity_id = public.opportunity_revenue_schedule.opportunity_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'contributor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.opportunities
      WHERE id = public.opportunity_revenue_schedule.opportunity_id
        AND owner_user_id = auth.uid()
    )
    OR public.current_user_role() IN ('admin', 'group_sales_lead')
    OR EXISTS (
      SELECT 1 FROM public.opportunity_team_members
      WHERE opportunity_id = public.opportunity_revenue_schedule.opportunity_id
        AND user_id = auth.uid()
        AND role IN ('owner', 'contributor')
    )
  );

-- ── Delete ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "opportunity_revenue_schedule_delete_via_visibility" ON public.opportunity_revenue_schedule;
CREATE POLICY "opportunity_revenue_schedule_delete_via_visibility"
  ON public.opportunity_revenue_schedule
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ── Service role ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "service_role_all_opportunity_revenue_schedule" ON public.opportunity_revenue_schedule;
CREATE POLICY "service_role_all_opportunity_revenue_schedule"
  ON public.opportunity_revenue_schedule
  TO service_role
  USING (true)
  WITH CHECK (true);
