-- supabase/migrations/20260506000002_nullable_account_id_deadletter_message_id.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-288 / T-010b: Schema fixes for the inbound email pipeline.
--
-- F1: Drop NOT NULL on activities.account_id so unassigned activities can be
--     created when no account domain matches (multi-match or no-match scenario).
--     FK constraint stays — Postgres skips FK validation for NULL values.
--
-- F2: Add message_id column + index to inbound_email_deadletter for replay
--     protection (check whether a message-id was already seen in activities or
--     deadletter).
--
-- Also restores the admin bypass on the SELECT policy that was lost in
-- 20260506000001_activities_rls_tightening.sql.  Without it, admins who are not
-- the activity author cannot read activities with a NULL account_id (the
-- EXISTS-subquery on accounts short-circuits to false when account_id IS NULL).
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- F1: nullable activities.account_id
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.activities
  ALTER COLUMN account_id DROP NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- F2: inbound_email_deadletter.message_id
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.inbound_email_deadletter
  ADD COLUMN IF NOT EXISTS message_id text;

CREATE INDEX IF NOT EXISTS idx_deadletter_message_id
  ON public.inbound_email_deadletter(message_id)
  WHERE message_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Fix SELECT policy: restore admin bypass
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "activities_select_via_opportunity_or_account" ON public.activities;
DROP POLICY IF EXISTS "activities_select_scoped" ON public.activities;
DROP POLICY IF EXISTS "activities_select_all_authenticated" ON public.activities;

CREATE POLICY "activities_select_via_opportunity_or_account"
  ON public.activities
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'admin'
    OR EXISTS (
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
