-- supabase/migrations/20260506000000_fix_activities_rls.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Fixes overly-permissive SELECT RLS policy on public.activities (ORR-267).
-- Replaces the overly-permissive SELECT policy with scoped visibility based on:
--   - activity user_id matches current user
--   - related account ownership/creation
--   - related opportunity visibility
--   - admin role
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. activities — scoped SELECT policy
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "activities_select_all_authenticated" ON public.activities;

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
