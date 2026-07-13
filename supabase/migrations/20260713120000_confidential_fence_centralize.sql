-- supabase/migrations/20260713120000_confidential_fence_centralize.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Confidential-tier fence — CENTRALIZE + COMPLETE the sweep (ORR-692).
--
-- The recurring bug class: the Confidential admin fence is asserted per child
-- path, so every new opportunity-child table (or new command policy) has to be
-- remembered in every place the fence lives — and keeps getting missed
-- (knowledge-search leak #167, revenue-schedule SEC-1, cashflow_milestone). Prior
-- migrations fenced only the SELECT paths of some children and the opportunities
-- write paths (SEC-1..4, 20260705010000). A full audit found the fence still
-- missing on: the audit_log child list, document_chunks (fenced via a fragile
-- denormalized column), opportunity_visibility / approval_instances SELECT, and
-- the INSERT/UPDATE/DELETE admin branches of every write-bearing child + the two
-- SECURITY DEFINER replace_* RPCs.
--
-- This migration:
--   1. Centralizes the audit_log fence behind one helper so ALL children (present
--      and future) are covered with no table list to maintain.
--   2. Fences every remaining child READ path via the canonical
--      opportunity_is_confidential() helper (dropping document_chunks' denorm tier).
--   3. Fences every child WRITE path (admin branch) so admins cannot tamper with a
--      Confidential deal's children — the owner/author/member branches are
--      untouched, and Standard/Restricted behaviour is unchanged.
--
-- Every fence reuses the single SECURITY DEFINER helper opportunity_is_confidential(uuid).
-- opportunity_is_confidential(NULL) = false, so account-level rows (NULL opportunity_id)
-- stay admin-accessible. Idempotent (CREATE OR REPLACE / DROP POLICY IF EXISTS).

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. audit_log — central helper, no hardcoded child-table list
-- ════════════════════════════════════════════════════════════════════════════════
-- Fences ANY audit row that references a Confidential opportunity — whether the row
-- IS the opportunity (table_name='opportunities', row_id=opp id) or a child carrying
-- opportunity_id in its row JSON. No table list; future children covered on day one.
CREATE OR REPLACE FUNCTION public.audit_row_is_confidential(
  _table_name text,
  _row_id     uuid,
  _new_data   jsonb,
  _old_data   jsonb
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _table_name = 'opportunities'
      THEN public.opportunity_is_confidential(_row_id)
    ELSE public.opportunity_is_confidential(
      NULLIF(COALESCE(_new_data->>'opportunity_id', _old_data->>'opportunity_id'), '')::uuid
    )
  END;
$$;

REVOKE ALL ON FUNCTION public.audit_row_is_confidential(text, uuid, jsonb, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.audit_row_is_confidential(text, uuid, jsonb, jsonb) TO authenticated;

DROP POLICY IF EXISTS "audit_log_select_authenticated" ON public.audit_log;
CREATE POLICY "audit_log_select_authenticated"
  ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (
    public.current_user_role() = 'admin'
    AND NOT public.audit_row_is_confidential(table_name, row_id, new_data, old_data)
  );

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. Remaining READ paths → canonical helper
-- ════════════════════════════════════════════════════════════════════════════════

-- 2a. document_chunks: replace the denormalized `visibility_tier <> 'confidential'`
--     with the canonical helper (a stale denorm tier could silently un-fence the
--     embedded document text — the #167 leak family).
DROP POLICY IF EXISTS "document_chunks_select_scoped" ON public.document_chunks;
CREATE POLICY "document_chunks_select_scoped"
  ON public.document_chunks
  FOR SELECT
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.document_chunks.opportunity_id
        AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = public.document_chunks.account_id
        AND (account_owner_user_id = auth.uid() OR created_by = auth.uid())
    )
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.document_chunks.opportunity_id))
  );

-- 2b. opportunity_visibility: an admin could read the membership rows of a
--     Confidential deal (existence + who is entitled). Fence the admin branch; a
--     user always sees their OWN rows (needed by every child policy's EXISTS check).
DROP POLICY IF EXISTS "opportunity_visibility_select_all_authenticated" ON public.opportunity_visibility;
CREATE POLICY "opportunity_visibility_select_all_authenticated"
  ON public.opportunity_visibility
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.opportunity_visibility.opportunity_id))
  );

-- 2c. approval_instances SELECT: the read helper's admin branch was unfenced.
-- CREATE OR REPLACE keeps the function OID, so the approval_instances_select_scoped
-- policy that depends on it keeps working with the new (fenced) body — no DROP
-- CASCADE, no policy churn.
CREATE OR REPLACE FUNCTION public.can_read_approval_instance(_instance_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
      public.current_user_role() = 'admin'
      AND NOT public.opportunity_is_confidential(
        (SELECT opportunity_id FROM public.approval_instances WHERE id = _instance_id))
    )
    OR EXISTS (
      SELECT 1 FROM public.approval_instances i
      WHERE i.id = _instance_id AND i.triggered_by_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.approval_steps s
      JOIN public.approval_instances i ON i.id = s.instance_id
      WHERE s.instance_id = _instance_id
        AND (
          s.approver_user_id = auth.uid()
          OR auth.uid() = ANY (COALESCE(s.approver_user_ids, ARRAY[]::uuid[]))
          OR (
            s.approver_role IS NOT NULL
            AND public.current_user_role() = s.approver_role
            AND i.business_entity_id = (SELECT primary_entity_id FROM public.users WHERE id = auth.uid())
          )
        )
    );
$$;

-- (grants unchanged by CREATE OR REPLACE, but re-assert to be explicit/idempotent)
REVOKE ALL ON FUNCTION public.can_read_approval_instance(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_read_approval_instance(uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. WRITE paths → fence the admin branch (owner/author/member branches unchanged)
-- ════════════════════════════════════════════════════════════════════════════════

-- 3a. opportunity_splits (admin-managed)
DROP POLICY IF EXISTS "opportunity_splits_insert_admin" ON public.opportunity_splits;
CREATE POLICY "opportunity_splits_insert_admin" ON public.opportunity_splits
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'admin'
    AND NOT public.opportunity_is_confidential(public.opportunity_splits.opportunity_id));
DROP POLICY IF EXISTS "opportunity_splits_update_admin" ON public.opportunity_splits;
CREATE POLICY "opportunity_splits_update_admin" ON public.opportunity_splits
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin'
    AND NOT public.opportunity_is_confidential(public.opportunity_splits.opportunity_id))
  WITH CHECK (public.current_user_role() = 'admin'
    AND NOT public.opportunity_is_confidential(public.opportunity_splits.opportunity_id));
DROP POLICY IF EXISTS "opportunity_splits_delete_admin" ON public.opportunity_splits;
CREATE POLICY "opportunity_splits_delete_admin" ON public.opportunity_splits
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin'
    AND NOT public.opportunity_is_confidential(public.opportunity_splits.opportunity_id));

-- 3b. opportunity_team_members (admin-managed)
DROP POLICY IF EXISTS "opportunity_team_members_insert_admin" ON public.opportunity_team_members;
CREATE POLICY "opportunity_team_members_insert_admin" ON public.opportunity_team_members
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'admin'
    AND NOT public.opportunity_is_confidential(public.opportunity_team_members.opportunity_id));
DROP POLICY IF EXISTS "opportunity_team_members_update_admin" ON public.opportunity_team_members;
CREATE POLICY "opportunity_team_members_update_admin" ON public.opportunity_team_members
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin'
    AND NOT public.opportunity_is_confidential(public.opportunity_team_members.opportunity_id))
  WITH CHECK (public.current_user_role() = 'admin'
    AND NOT public.opportunity_is_confidential(public.opportunity_team_members.opportunity_id));
DROP POLICY IF EXISTS "opportunity_team_members_delete_admin" ON public.opportunity_team_members;
CREATE POLICY "opportunity_team_members_delete_admin" ON public.opportunity_team_members
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin'
    AND NOT public.opportunity_is_confidential(public.opportunity_team_members.opportunity_id));

-- 3c. opportunity_stage_history (author OR admin)
DROP POLICY IF EXISTS "stage_history_insert_author_or_admin" ON public.opportunity_stage_history;
CREATE POLICY "stage_history_insert_author_or_admin" ON public.opportunity_stage_history
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.opportunity_stage_history.opportunity_id))
  );
DROP POLICY IF EXISTS "stage_history_update_author_or_admin" ON public.opportunity_stage_history;
CREATE POLICY "stage_history_update_author_or_admin" ON public.opportunity_stage_history
  FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.opportunity_stage_history.opportunity_id))
  );
DROP POLICY IF EXISTS "stage_history_delete_admin" ON public.opportunity_stage_history;
CREATE POLICY "stage_history_delete_admin" ON public.opportunity_stage_history
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin'
    AND NOT public.opportunity_is_confidential(public.opportunity_stage_history.opportunity_id));

-- 3d. activities (author OR admin; opportunity_id NULL = account-level, stays open)
DROP POLICY IF EXISTS "activities_insert_author_or_admin" ON public.activities;
CREATE POLICY "activities_insert_author_or_admin" ON public.activities
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.activities.opportunity_id))
  );
DROP POLICY IF EXISTS "activities_update_author_or_admin" ON public.activities;
CREATE POLICY "activities_update_author_or_admin" ON public.activities
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.activities.opportunity_id))
  );
DROP POLICY IF EXISTS "activities_delete_admin" ON public.activities;
CREATE POLICY "activities_delete_admin" ON public.activities
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin'
    AND NOT public.opportunity_is_confidential(public.activities.opportunity_id));

-- 3e. documents INSERT (uploader OR admin; opportunity_id NULL = account doc)
DROP POLICY IF EXISTS "documents_insert_authenticated" ON public.documents;
CREATE POLICY "documents_insert_authenticated" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.documents.opportunity_id))
  );

-- 3f. approval_instances writes (admin-only; opportunity_id nullable)
DROP POLICY IF EXISTS "approval_instances_insert_admin" ON public.approval_instances;
CREATE POLICY "approval_instances_insert_admin" ON public.approval_instances
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'admin'
    AND NOT public.opportunity_is_confidential(public.approval_instances.opportunity_id));
DROP POLICY IF EXISTS "approval_instances_update_admin" ON public.approval_instances;
CREATE POLICY "approval_instances_update_admin" ON public.approval_instances
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin'
    AND NOT public.opportunity_is_confidential(public.approval_instances.opportunity_id));
DROP POLICY IF EXISTS "approval_instances_delete_admin" ON public.approval_instances;
CREATE POLICY "approval_instances_delete_admin" ON public.approval_instances
  FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin'
    AND NOT public.opportunity_is_confidential(public.approval_instances.opportunity_id));

-- ════════════════════════════════════════════════════════════════════════════════
-- 4. SECURITY DEFINER write RPCs — add the Confidential guard (they bypass RLS)
-- ════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.replace_opportunity_splits(_opportunity_id uuid, _rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF public.current_user_role() <> 'admin'
     OR public.opportunity_is_confidential(_opportunity_id) THEN
    RAISE EXCEPTION 'not authorised to modify splits for opportunity %', _opportunity_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1 FROM public.opportunities WHERE id = _opportunity_id FOR UPDATE;

  DELETE FROM public.opportunity_splits WHERE opportunity_id = _opportunity_id;

  INSERT INTO public.opportunity_splits (opportunity_id, sales_unit_id, user_id, pct, notes)
  SELECT _opportunity_id,
         (elem->>'sales_unit_id')::uuid,
         NULLIF(elem->>'user_id', '')::uuid,
         (elem->>'pct')::numeric,
         NULLIF(elem->>'notes', '')
  FROM jsonb_array_elements(coalesce(_rows, '[]'::jsonb)) AS elem;
END;
$function$;

CREATE OR REPLACE FUNCTION public.replace_opportunity_team_members(_opportunity_id uuid, _rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF public.current_user_role() <> 'admin'
     OR public.opportunity_is_confidential(_opportunity_id) THEN
    RAISE EXCEPTION 'not authorised to modify the team for opportunity %', _opportunity_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1 FROM public.opportunities WHERE id = _opportunity_id FOR UPDATE;

  DELETE FROM public.opportunity_team_members WHERE opportunity_id = _opportunity_id;

  INSERT INTO public.opportunity_team_members (opportunity_id, user_id, role, added_by)
  SELECT _opportunity_id,
         (elem->>'user_id')::uuid,
         (elem->>'role')::public.opportunity_team_role,
         auth.uid()
  FROM jsonb_array_elements(coalesce(_rows, '[]'::jsonb)) AS elem;
END;
$function$;
