-- supabase/migrations/20260713140000_region_group_visibility.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Region / group visibility paths in the engine (ORR-714 / T-140).
--
-- Ratified O1 (ORR-713, 2026-07-13):
--   * Region model = a first-class `regions` table; entities belong to a region.
--     regional_head sees deals in ALL entities sharing their own entity's region.
--   * exec / group_sales_lead see group-wide (every entity).
--   * Tier ceiling = all tiers EXCEPT Confidential (D5 firewall preserved).
--   * Implementation = additive RLS policy short-circuit (like the admin branch),
--     NOT a visibility fan-out. It only WIDENS read access for these leadership
--     roles; it never removes anyone's access and never touches writes.
--
-- Discovery gap this closes: `opportunities.view_all` was granted to these roles
-- but no RLS/engine path enforced it — a regional_head/exec only saw deals by
-- sitting atop the manager tree. This adds the explicit path.
--
-- Dormant until regions are configured: with no region_id set, regional_head gets
-- no extra access (helper returns false); exec/group_sales_lead are group-wide
-- regardless. Idempotent.

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. regions table + entities.region_id
-- ════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.regions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  code        text        UNIQUE CHECK (code IS NULL OR char_length(code) BETWEEN 1 AND 24),
  active      boolean     NOT NULL DEFAULT true,
  custom_data jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid        REFERENCES public.users(id),
  updated_by  uuid        REFERENCES public.users(id)
);

COMMENT ON TABLE public.regions IS
  'Geographic/organisational grouping of entities (SOW §17 tier-2). regional_head sees deals across every entity in their region.';

ALTER TABLE public.entities
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.regions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_entities_region ON public.entities (region_id);

-- updated_at + audit
CREATE OR REPLACE FUNCTION public.set_regions_updated_at()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS regions_updated_at_trigger ON public.regions;
CREATE TRIGGER regions_updated_at_trigger
  BEFORE UPDATE ON public.regions
  FOR EACH ROW EXECUTE FUNCTION public.set_regions_updated_at();

SELECT audit.attach_trigger('public.regions');

-- RLS: readable by any authenticated user (needed to render the scope selector +
-- resolve the visibility helper); writable by Super Admin only.
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regions_select_authenticated" ON public.regions;
CREATE POLICY "regions_select_authenticated" ON public.regions
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "regions_insert_admin" ON public.regions;
CREATE POLICY "regions_insert_admin" ON public.regions
  FOR INSERT TO authenticated WITH CHECK (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "regions_update_admin" ON public.regions;
CREATE POLICY "regions_update_admin" ON public.regions
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin')
  WITH CHECK (public.current_user_role() = 'admin');
DROP POLICY IF EXISTS "regions_delete_admin" ON public.regions;
CREATE POLICY "regions_delete_admin" ON public.regions
  FOR DELETE TO authenticated USING (public.current_user_role() = 'admin');

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. The role-scope read helper (single source of the region/group rule)
-- ════════════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER so it can resolve the deal's entity/region and the caller's own
-- region regardless of RLS. Confidential is NOT checked here — every caller adds
-- `AND NOT opportunity_is_confidential(...)`, so D5 stays enforced at the policy and
-- the child structural invariant (confidential_fence_complete.test.sql) stays green.
CREATE OR REPLACE FUNCTION public.can_view_opportunity_by_role_scope(_opp_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE public.current_user_role()
    -- Group-wide leadership: every entity.
    WHEN 'exec' THEN true
    WHEN 'group_sales_lead' THEN true
    -- Region-wide: the deal's selling entity is in the same region as the caller's
    -- own entity (both regions must be set). Dormant until regions are configured.
    WHEN 'regional_head' THEN EXISTS (
      SELECT 1
      FROM public.opportunities o
      JOIN public.entities de ON de.id = o.entity_sales_id
      JOIN public.users cu     ON cu.id = auth.uid()
      JOIN public.entities ce  ON ce.id = cu.primary_entity_id
      WHERE o.id = _opp_id
        AND de.region_id IS NOT NULL
        AND de.region_id = ce.region_id
    )
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.can_view_opportunity_by_role_scope(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_view_opportunity_by_role_scope(uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. Apply the short-circuit to opportunities + every child SELECT policy
-- ════════════════════════════════════════════════════════════════════════════════
-- Each gets a sibling of its admin branch: the role-scope helper, fenced from
-- Confidential exactly like the admin branch. Bodies are the current (post-ORR-692)
-- definitions with the one OR-branch appended.

-- opportunities (parent: no opportunity_id column, uses visibility_tier inline)
DROP POLICY IF EXISTS "opportunities_select_via_visibility" ON public.opportunities;
CREATE POLICY "opportunities_select_via_visibility" ON public.opportunities
  FOR SELECT TO authenticated
  USING (
    owner_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunities.id AND user_id = auth.uid()
    )
    OR (public.current_user_role() = 'admin' AND visibility_tier <> 'confidential')
    OR (public.can_view_opportunity_by_role_scope(public.opportunities.id) AND visibility_tier <> 'confidential')
  );

-- opportunity_splits
DROP POLICY IF EXISTS "opportunity_splits_select_via_opportunity" ON public.opportunity_splits;
CREATE POLICY "opportunity_splits_select_via_opportunity" ON public.opportunity_splits
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunity_splits.opportunity_id AND user_id = auth.uid()
    )
    OR (public.current_user_role() = 'admin' AND NOT public.opportunity_is_confidential(public.opportunity_splits.opportunity_id))
    OR (public.can_view_opportunity_by_role_scope(public.opportunity_splits.opportunity_id) AND NOT public.opportunity_is_confidential(public.opportunity_splits.opportunity_id))
  );

-- opportunity_team_members
DROP POLICY IF EXISTS "opportunity_team_members_select_via_opportunity" ON public.opportunity_team_members;
CREATE POLICY "opportunity_team_members_select_via_opportunity" ON public.opportunity_team_members
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunity_team_members.opportunity_id AND user_id = auth.uid()
    )
    OR (public.current_user_role() = 'admin' AND NOT public.opportunity_is_confidential(public.opportunity_team_members.opportunity_id))
    OR (public.can_view_opportunity_by_role_scope(public.opportunity_team_members.opportunity_id) AND NOT public.opportunity_is_confidential(public.opportunity_team_members.opportunity_id))
  );

-- cashflow_milestone
DROP POLICY IF EXISTS "cashflow_milestone_select" ON public.cashflow_milestone;
CREATE POLICY "cashflow_milestone_select" ON public.cashflow_milestone
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.cashflow_milestone.opportunity_id AND user_id = auth.uid()
    )
    OR (public.current_user_role() = 'admin' AND NOT public.opportunity_is_confidential(public.cashflow_milestone.opportunity_id))
    OR (public.can_view_opportunity_by_role_scope(public.cashflow_milestone.opportunity_id) AND NOT public.opportunity_is_confidential(public.cashflow_milestone.opportunity_id))
  );

-- opportunity_stage_history
DROP POLICY IF EXISTS "stage_history_select_scoped" ON public.opportunity_stage_history;
CREATE POLICY "stage_history_select_scoped" ON public.opportunity_stage_history
  FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.opportunity_stage_history.opportunity_id AND user_id = auth.uid()
    )
    OR (public.current_user_role() = 'admin' AND NOT public.opportunity_is_confidential(public.opportunity_stage_history.opportunity_id))
    OR (public.can_view_opportunity_by_role_scope(public.opportunity_stage_history.opportunity_id) AND NOT public.opportunity_is_confidential(public.opportunity_stage_history.opportunity_id))
  );

-- activities (opportunity_id NULL = account-level, unchanged)
DROP POLICY IF EXISTS "activities_select_via_opportunity_or_account" ON public.activities;
CREATE POLICY "activities_select_via_opportunity_or_account" ON public.activities
  FOR SELECT TO authenticated
  USING (
    (public.current_user_role() = 'admin' AND NOT public.opportunity_is_confidential(public.activities.opportunity_id))
    OR (public.can_view_opportunity_by_role_scope(public.activities.opportunity_id) AND NOT public.opportunity_is_confidential(public.activities.opportunity_id))
    OR EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.activities.opportunity_id AND user_id = auth.uid()
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

-- documents
DROP POLICY IF EXISTS "documents_select_scoped" ON public.documents;
CREATE POLICY "documents_select_scoped" ON public.documents
  FOR SELECT TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.documents.opportunity_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = public.documents.account_id
        AND (account_owner_user_id = auth.uid() OR created_by = auth.uid())
    )
    OR (public.current_user_role() = 'admin' AND NOT public.opportunity_is_confidential(public.documents.opportunity_id))
    OR (public.can_view_opportunity_by_role_scope(public.documents.opportunity_id) AND NOT public.opportunity_is_confidential(public.documents.opportunity_id))
  );

-- document_chunks (RAG)
DROP POLICY IF EXISTS "document_chunks_select_scoped" ON public.document_chunks;
CREATE POLICY "document_chunks_select_scoped" ON public.document_chunks
  FOR SELECT TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.document_chunks.opportunity_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = public.document_chunks.account_id
        AND (account_owner_user_id = auth.uid() OR created_by = auth.uid())
    )
    OR (public.current_user_role() = 'admin' AND NOT public.opportunity_is_confidential(public.document_chunks.opportunity_id))
    OR (public.can_view_opportunity_by_role_scope(public.document_chunks.opportunity_id) AND NOT public.opportunity_is_confidential(public.document_chunks.opportunity_id))
  );

-- opportunity_revenue_schedule (helper-gated; add read-only role scope, NOT writes)
DROP POLICY IF EXISTS "opportunity_revenue_schedule_select_via_visibility" ON public.opportunity_revenue_schedule;
CREATE POLICY "opportunity_revenue_schedule_select_via_visibility" ON public.opportunity_revenue_schedule
  FOR SELECT TO authenticated
  USING (
    public.can_access_opportunity_schedule(opportunity_id)
    OR (public.can_view_opportunity_by_role_scope(opportunity_id) AND NOT public.opportunity_is_confidential(opportunity_id))
  );

-- approval_instances (helper-gated SELECT; add read-only role scope, NOT writes)
DROP POLICY IF EXISTS "approval_instances_select_scoped" ON public.approval_instances;
CREATE POLICY "approval_instances_select_scoped" ON public.approval_instances
  FOR SELECT TO authenticated
  USING (
    public.can_read_approval_instance(id)
    OR (public.can_view_opportunity_by_role_scope(opportunity_id) AND NOT public.opportunity_is_confidential(opportunity_id))
  );
