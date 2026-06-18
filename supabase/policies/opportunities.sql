-- supabase/policies/opportunities.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for the opportunity schema (opportunities, opportunity_splits,
-- opportunity_team_members, opportunity_visibility).
-- These are also embedded in 20260505000007_opportunity_visibility.sql so the
-- migration is self-contained.  This file exists for security-review readability.

-- ── opportunities ─────────────────────────────────────────────────────────────
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opportunities_select_via_visibility" ON public.opportunities;
CREATE POLICY "opportunities_select_via_visibility"
  ON public.opportunities
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunities.id
        AND user_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "opportunities_insert_authenticated" ON public.opportunities;
CREATE POLICY "opportunities_insert_authenticated"
  ON public.opportunities
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_user_id = auth.uid()
    OR public.current_user_role() IN ('admin', 'group_sales_lead')
  );

DROP POLICY IF EXISTS "opportunities_update_owner_or_team_or_admin" ON public.opportunities;
CREATE POLICY "opportunities_update_owner_or_team_or_admin"
  ON public.opportunities
  FOR UPDATE
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR public.current_user_role() IN ('admin', 'group_sales_lead')
    OR EXISTS (
      SELECT 1 FROM public.opportunity_team_members
      WHERE opportunity_id = public.opportunities.id
        AND user_id = auth.uid()
        AND role IN ('owner', 'contributor')
    )
  );

DROP POLICY IF EXISTS "opportunities_delete_admin" ON public.opportunities;
CREATE POLICY "opportunities_delete_admin"
  ON public.opportunities
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ── opportunity_splits ────────────────────────────────────────────────────────
ALTER TABLE public.opportunity_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opportunity_splits_select_via_opportunity" ON public.opportunity_splits;
CREATE POLICY "opportunity_splits_select_via_opportunity"
  ON public.opportunity_splits
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunity_splits.opportunity_id
        AND user_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "opportunity_splits_write_admin" ON public.opportunity_splits;
CREATE POLICY "opportunity_splits_write_admin"
  ON public.opportunity_splits
  FOR ALL
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- ── opportunity_team_members ──────────────────────────────────────────────────
ALTER TABLE public.opportunity_team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opportunity_team_members_select_via_opportunity" ON public.opportunity_team_members;
CREATE POLICY "opportunity_team_members_select_via_opportunity"
  ON public.opportunity_team_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunity_team_members.opportunity_id
        AND user_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "opportunity_team_members_write_admin" ON public.opportunity_team_members;
CREATE POLICY "opportunity_team_members_write_admin"
  ON public.opportunity_team_members
  FOR ALL
  TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');

-- ── opportunity_visibility ────────────────────────────────────────────────────
ALTER TABLE public.opportunity_visibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "opportunity_visibility_select_all_authenticated" ON public.opportunity_visibility;
CREATE POLICY "opportunity_visibility_select_all_authenticated"
  ON public.opportunity_visibility
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.current_user_role() = 'admin'
  );
