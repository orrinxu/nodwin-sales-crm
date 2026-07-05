-- supabase/migrations/20260705010000_confidential_fence_reassert.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- SECURITY: re-assert the Confidential-tier admin fence on every opportunity
-- child path. The fence added in 20260619000006_confidential_tier_admin_masking
-- was applied ONLY to the opportunities SELECT policy; sibling read/write paths
-- were left open or later reverted (audit finding SEC-1..4):
--   * SEC-1 can_access_opportunity_schedule dropped the fence (admins read/write
--     Confidential per-month revenue amounts).
--   * SEC-2 audit_log exposes full Confidential row JSON (amount/description) to
--     admins, bypassing the mask.
--   * SEC-3 opportunities UPDATE/DELETE have no fence (blind admin tamper/delete).
--   * SEC-4 opportunity_stage_history exposes Confidential history to admins and
--     ignores opportunity_visibility (under-returns to entitled members).
--
-- All fences reuse the existing SECURITY DEFINER helper opportunity_is_confidential(uuid)
-- so the rule lives in ONE place. Standard/Restricted behaviour is unchanged;
-- only the admin/lead branch is fenced out of Confidential.
--
-- Idempotent (CREATE OR REPLACE / DROP POLICY IF EXISTS).

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEC-1 — revenue schedule: fence the admin branch
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.can_access_opportunity_schedule(_opportunity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = _opportunity_id
        AND user_id = auth.uid()
    )
    OR (
      public.current_user_role() = 'admin'
      AND NOT public.opportunity_is_confidential(_opportunity_id)
    );
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEC-3 — opportunities UPDATE / DELETE: fence the admin / group_sales_lead branch
-- (owner and team members keep their access to Confidential deals they're on)
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "opportunities_update_owner_or_team_or_admin" ON public.opportunities;
CREATE POLICY "opportunities_update_owner_or_team_or_admin"
  ON public.opportunities
  FOR UPDATE
  TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR (
      public.current_user_role() IN ('admin', 'group_sales_lead')
      AND NOT public.opportunity_is_confidential(id)
    )
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
  USING (
    public.current_user_role() = 'admin'
    AND NOT public.opportunity_is_confidential(id)
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEC-4 — stage history: use the canonical opportunity_visibility check + fenced admin
-- (fixes both the admin Confidential leak AND the member under-return)
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "stage_history_select_scoped" ON public.opportunity_stage_history;
CREATE POLICY "stage_history_select_scoped"
  ON public.opportunity_stage_history
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunity_stage_history.opportunity_id
        AND user_id = auth.uid()
    )
    OR (
      public.current_user_role() = 'admin'
      AND NOT public.opportunity_is_confidential(public.opportunity_stage_history.opportunity_id)
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- SEC-2 — audit_log: fence admin reads of audit rows tied to a Confidential deal.
-- audit_log stores (table_name, row_id, old_data, new_data). For 'opportunities'
-- rows, row_id IS the opportunity id. For opportunity-child tables, the
-- opportunity id is carried in the row JSON. Rows we cannot correlate (or whose
-- opportunity was hard-deleted) remain visible — a known residual gap, flagged.
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "audit_log_select_authenticated" ON public.audit_log;
CREATE POLICY "audit_log_select_authenticated"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'admin'
    AND NOT (
      table_name = 'opportunities'
      AND public.opportunity_is_confidential(row_id)
    )
    AND NOT (
      -- Exactly the audited tables that carry an opportunity_id in their row JSON
      -- (activities.subject/body, documents metadata, revenue amounts, etc.).
      table_name IN (
        'activities',
        'approval_instances',
        'documents',
        'opportunity_revenue_schedule',
        'opportunity_splits',
        'opportunity_team_members'
      )
      AND public.opportunity_is_confidential(
        NULLIF(COALESCE(new_data->>'opportunity_id', old_data->>'opportunity_id'), '')::uuid
      )
    )
  );
