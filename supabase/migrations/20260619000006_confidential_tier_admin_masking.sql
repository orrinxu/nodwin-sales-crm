-- supabase/migrations/20260619000006_confidential_tier_admin_masking.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Confidential visibility-tier masking (ORR-600, batch item #3).
--
-- SOW §3.2: for Confidential opportunities an Admin may see ONLY metadata
-- (existence, owner, value bucket) — never amount / description / files. But
-- every opportunity-scoped SELECT policy ended with a blanket
-- `OR current_user_role() = 'admin'`, granting admins full-row access to
-- Confidential deals and all their child data (splits, team, revenue schedule,
-- activities/notes, documents).
--
-- Fix: the admin branch now excludes Confidential deals. Admins keep full access
-- to Standard/Restricted deals and to any Confidential deal they are explicitly
-- authorised for (owner / confidentiality override — via the visibility cache).
-- A separate SECURITY DEFINER function exposes metadata-only rows for Confidential
-- deals to admins, satisfying the "existence + owner + value bucket" requirement.

-- ── Helper: is this opportunity Confidential? (RLS-bypassing) ─────────────────
-- SECURITY DEFINER so child-table policies can check the parent tier without
-- being subject to the opportunities RLS policy (which would hide the row and
-- make the check unreliable / recursive). Returns false for NULL / missing ids
-- so account-level rows (opportunity_id IS NULL) remain admin-visible.
CREATE OR REPLACE FUNCTION public.opportunity_is_confidential(_opp_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT visibility_tier = 'confidential'
       FROM public.opportunities
      WHERE id = _opp_id),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.opportunity_is_confidential(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.opportunity_is_confidential(uuid) TO authenticated;

-- ── opportunities ────────────────────────────────────────────────────────────
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
    OR (public.current_user_role() = 'admin' AND visibility_tier <> 'confidential')
  );

-- ── opportunity_splits ───────────────────────────────────────────────────────
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
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.opportunity_splits.opportunity_id))
  );

-- ── opportunity_team_members ─────────────────────────────────────────────────
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
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.opportunity_team_members.opportunity_id))
  );

-- ── opportunity_revenue_schedule ─────────────────────────────────────────────
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
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.opportunity_revenue_schedule.opportunity_id))
  );

-- ── documents ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "documents_select_scoped" ON public.documents;
CREATE POLICY "documents_select_scoped"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.documents.opportunity_id
        AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = public.documents.account_id
        AND (account_owner_user_id = auth.uid() OR created_by = auth.uid())
    )
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.documents.opportunity_id))
  );

-- ── activities ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "activities_select_via_opportunity_or_account" ON public.activities;
CREATE POLICY "activities_select_via_opportunity_or_account"
  ON public.activities
  FOR SELECT
  TO authenticated
  USING (
    (public.current_user_role() = 'admin'
      AND NOT public.opportunity_is_confidential(public.activities.opportunity_id))
    OR EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.activities.opportunity_id
        AND user_id = auth.uid()
    )
    OR (
      opportunity_id IS NULL
      AND (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.accounts
          WHERE id = public.activities.account_id
            AND (account_owner_user_id = auth.uid() OR created_by = auth.uid())
        )
      )
    )
  );

-- ── Admin metadata surface for Confidential deals ────────────────────────────
-- Existence + owner + value bucket only. No amount / description / files. Admin
-- only. SECURITY DEFINER so it can read Confidential rows the admin's RLS now
-- (correctly) hides.
CREATE OR REPLACE FUNCTION public.confidential_opportunities_metadata()
RETURNS TABLE (
  id             uuid,
  owner_user_id  uuid,
  owner_name     text,
  value_bucket   text,
  created_at     timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    o.owner_user_id,
    u.full_name AS owner_name,
    CASE
      WHEN o.amount IS NULL      THEN 'unknown'
      WHEN o.amount < 10000      THEN '<10K'
      WHEN o.amount < 50000      THEN '10K-50K'
      WHEN o.amount < 250000     THEN '50K-250K'
      WHEN o.amount < 1000000    THEN '250K-1M'
      ELSE '1M+'
    END AS value_bucket,
    o.created_at
  FROM public.opportunities o
  LEFT JOIN public.users u ON u.id = o.owner_user_id
  WHERE o.visibility_tier = 'confidential'
    AND public.current_user_role() = 'admin';
$$;

REVOKE ALL ON FUNCTION public.confidential_opportunities_metadata() FROM public;
GRANT EXECUTE ON FUNCTION public.confidential_opportunities_metadata() TO authenticated;

-- ── Close the admin SELECT leak via the all-command write policies ───────────
-- opportunity_splits / opportunity_team_members granted admins write access with
-- a single all-command admin policy (USING role = admin). An all-command policy
-- also covers SELECT, so admins could still read splits/team of Confidential deals
-- through it, bypassing the scoped SELECT policy above. Replace each with explicit
-- INSERT / UPDATE / DELETE policies (same admin-only write capability, no implicit
-- SELECT grant); SELECT is governed solely by the *_select_via_opportunity policies.

DROP POLICY IF EXISTS "opportunity_splits_write_admin" ON public.opportunity_splits;
CREATE POLICY "opportunity_splits_insert_admin" ON public.opportunity_splits
  FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = 'admin');
CREATE POLICY "opportunity_splits_update_admin" ON public.opportunity_splits
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');
CREATE POLICY "opportunity_splits_delete_admin" ON public.opportunity_splits
  FOR DELETE TO authenticated USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "opportunity_team_members_write_admin" ON public.opportunity_team_members;
CREATE POLICY "opportunity_team_members_insert_admin" ON public.opportunity_team_members
  FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = 'admin');
CREATE POLICY "opportunity_team_members_update_admin" ON public.opportunity_team_members
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');
CREATE POLICY "opportunity_team_members_delete_admin" ON public.opportunity_team_members
  FOR DELETE TO authenticated USING (public.current_user_role() = 'admin');
