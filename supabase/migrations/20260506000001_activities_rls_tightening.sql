-- supabase/migrations/20260506000001_activities_rls_tightening.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Ensures activities RLS policies are consistent with the tightened SELECT
-- policy introduced in ORR-209 and subsequent fixes. Scoped visibility:
--   - activity user_id matches current user
--   - related account is owned/created by current user
--   - related opportunity is visible via opportunity_visibility
--   - user has admin role
-- Also ensures INSERT/UPDATE are author-or-admin.
--
-- Idempotent: safe to re-run.

-- ── Drop previous policies ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "activities_select_all_authenticated" ON public.activities;
DROP POLICY IF EXISTS "activities_select_scoped" ON public.activities;
DROP POLICY IF EXISTS "activities_select_via_opportunity_or_account" ON public.activities;
DROP POLICY IF EXISTS "activities_insert_admin" ON public.activities;
DROP POLICY IF EXISTS "activities_update_admin" ON public.activities;

-- ── SELECT: scoped via user, account ownership, opportunity visibility, or admin ──
DROP POLICY IF EXISTS "activities_select_scoped" ON public.activities;
CREATE POLICY "activities_select_scoped"
  ON public.activities
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = public.activities.account_id
        AND (account_owner_user_id = auth.uid() OR created_by = auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.activities.opportunity_id
        AND user_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  );

-- ── INSERT: activity author or admin ──────────────────────────────────────────
DROP POLICY IF EXISTS "activities_insert_author_or_admin" ON public.activities;
CREATE POLICY "activities_insert_author_or_admin"
  ON public.activities
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.current_user_role() = 'admin');

-- ── UPDATE: activity author or admin ──────────────────────────────────────────
DROP POLICY IF EXISTS "activities_update_author_or_admin" ON public.activities;
CREATE POLICY "activities_update_author_or_admin"
  ON public.activities
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.current_user_role() = 'admin');
