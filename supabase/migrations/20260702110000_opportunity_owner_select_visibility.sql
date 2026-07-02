-- supabase/migrations/20260702110000_opportunity_owner_select_visibility.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (RLS change on opportunities visibility).
--
-- Fix: a non-admin owner could not create an opportunity through the app.
--
-- createOpportunity() runs under the RLS-enforced user session and does
-- `.insert(...).select(...)`, which supabase-js sends as INSERT ... RETURNING.
-- RETURNING evaluates the SELECT policy against the just-inserted row. The
-- opportunity's owner is granted visibility via the opportunity_visibility
-- membership table, but that row is populated by an AFTER-insert step, so at
-- RETURNING time it does not exist yet. The prior SELECT policy only allowed
-- visibility via that membership table or the admin branch, so a sales rep
-- creating their own deal hit:
--   ERROR: new row violates row-level security policy for table "opportunities"
-- even though the row WAS written — producing a phantom deal and a UI error.
--
-- Admins were unaffected (the admin branch satisfies RETURNING), which is why
-- manual testing (as admin) and psql/service-role fixtures never caught it.
--
-- Fix: add an explicit owner branch so an owner can always read their own
-- opportunity — correct on its own terms and enough to make RETURNING succeed
-- the moment the row exists. Confidential tier is unaffected: this only ever
-- widens visibility to the row's own owner (owner_user_id = auth.uid()), never
-- to anyone else, and an owner is expected to see the deal they created.

DROP POLICY IF EXISTS "opportunities_select_via_visibility" ON public.opportunities;
CREATE POLICY "opportunities_select_via_visibility"
  ON public.opportunities
  FOR SELECT
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunities.id
        AND user_id = auth.uid()
    )
    OR (public.current_user_role() = 'admin' AND visibility_tier <> 'confidential')
  );
