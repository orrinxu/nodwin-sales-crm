-- supabase/policies/activities_and_deadletter.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for public.activities and public.inbound_email_deadletter.
-- Embedded in 20260505000008_activities_and_deadletter.sql for self-contained
-- migrations; this file exists for security-review readability.
--
-- Note: activities.account_id was made nullable in 20260506000002 to allow
-- recording activities for unassigned inbound emails (ORR-286). The SELECT
-- policy handles NULL account_id correctly: the account-ownership EXISTS
-- clause evaluates to false, leaving user_id match, opportunity visibility,
-- and admin role as the remaining access paths.
--
-- Note: inbound_email_deadletter.message_id was added in 20260506000003 to
-- store the originating email's Message-ID for traceability and
-- deduplication (ORR-288 / T-010b). No RLS changes needed — deadletter is
-- admin-only.

-- ── activities ────────────────────────────────────────────────────────────────
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activities_select_via_opportunity_or_account" ON public.activities;
CREATE POLICY "activities_select_via_opportunity_or_account"
  ON public.activities
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.activities.opportunity_id
        AND user_id = auth.uid()
    )
    OR (
      public.activities.opportunity_id IS NULL
      AND (
        public.activities.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.accounts
          WHERE id = public.activities.account_id
            AND (account_owner_user_id = auth.uid() OR created_by = auth.uid())
        )
      )
    )
  );

DROP POLICY IF EXISTS "activities_insert_author_or_admin" ON public.activities;
CREATE POLICY "activities_insert_author_or_admin"
  ON public.activities
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "activities_update_author_or_admin" ON public.activities;
CREATE POLICY "activities_update_author_or_admin"
  ON public.activities
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "activities_delete_admin" ON public.activities;
CREATE POLICY "activities_delete_admin"
  ON public.activities
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ── inbound_email_deadletter ──────────────────────────────────────────────────
ALTER TABLE public.inbound_email_deadletter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deadletter_select_admin" ON public.inbound_email_deadletter;
CREATE POLICY "deadletter_select_admin"
  ON public.inbound_email_deadletter
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "deadletter_insert_admin" ON public.inbound_email_deadletter;
CREATE POLICY "deadletter_insert_admin"
  ON public.inbound_email_deadletter
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "deadletter_update_admin" ON public.inbound_email_deadletter;
CREATE POLICY "deadletter_update_admin"
  ON public.inbound_email_deadletter
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "deadletter_delete_admin" ON public.inbound_email_deadletter;
CREATE POLICY "deadletter_delete_admin"
  ON public.inbound_email_deadletter
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
