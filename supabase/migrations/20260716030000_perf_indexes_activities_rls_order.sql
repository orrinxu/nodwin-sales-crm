-- supabase/migrations/20260716030000_perf_indexes_activities_rls_order.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-759 (perf audit, cheap wins). Zero behaviour change:
--   1. idx_contacts_created_at — getContacts default-sorts by created_at DESC
--      (contacts.ts) with no supporting index.
--   2. idx_accounts_industry (partial) — accounts.ts filters .eq(industry) and
--      distinct_account_industries scans industry; both over non-deleted rows.
--   3. Reorder the activities SELECT policy's OR-chain so the cheap, index-backed
--      opportunity_visibility EXISTS (and the account-level opportunity_id IS NULL
--      branch) are evaluated FIRST — before the SECURITY DEFINER
--      can_view_opportunity_by_role_scope(), which previously ran for EVERY
--      activity row. OR is commutative, so the visible set is byte-for-byte
--      identical; only the short-circuit order changes. This matches the ordering
--      every other opportunity-child policy already uses. The confidential fence
--      stays on the admin / role-scope branches exactly as before.
--
-- Idempotent: safe to re-run.

-- ── 1 & 2. Cheap indexes ─────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_contacts_created_at
  ON public.contacts (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_accounts_industry
  ON public.accounts (industry)
  WHERE deleted_at IS NULL;

-- ── 3. Reorder the activities SELECT policy (cheap branches first) ────────────
-- can_view_opportunity_by_role_scope / opportunity_is_confidential stay `sql
-- STABLE` (inlineable) — never rewrite them to plpgsql.
DROP POLICY IF EXISTS "activities_select_via_opportunity_or_account" ON public.activities;
CREATE POLICY "activities_select_via_opportunity_or_account" ON public.activities
  FOR SELECT TO authenticated
  USING (
    -- Cheap, index-backed explicit visibility — the common path, short-circuits.
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.activities.opportunity_id AND user_id = auth.uid()
    )
    -- Account-level activity (no opportunity) — cheap, no role-scope call.
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
    -- Admin (confidential-fenced).
    OR (public.current_user_role() = 'admin' AND NOT public.opportunity_is_confidential(public.activities.opportunity_id))
    -- Role/region scope (confidential-fenced) — the expensive branch, now last so
    -- it only runs for rows the cheaper branches didn't already admit.
    OR (public.can_view_opportunity_by_role_scope(public.activities.opportunity_id) AND NOT public.opportunity_is_confidential(public.activities.opportunity_id))
  );
