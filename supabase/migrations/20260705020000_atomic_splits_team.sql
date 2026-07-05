-- supabase/migrations/20260705020000_atomic_splits_team.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Audit DATA-1/2: updateOpportunitySplits / updateOpportunityTeamMembers did a
-- two-call delete-then-insert with no transaction. A partial failure (bad FK,
-- duplicate, timeout) left the deal with ZERO splits / ZERO team — silently
-- destroying commission attribution AND the opportunity_visibility rows those
-- tables feed (split-unit managers / team members lose access).
--
-- These atomic replace RPCs mirror replace_revenue_schedule: authz check, row
-- lock, delete + insert in one SECURITY DEFINER transaction. Authz preserves the
-- existing admin-only write policy exactly (opportunity_splits/team are
-- admin-write today) — this is an atomicity fix, not an access change.
--
-- Idempotent (CREATE OR REPLACE).

-- The opportunity_splits pct-sum-100 invariant was enforced by a NON-deferred
-- AFTER-ROW trigger, which made an atomic replace impossible: deleting the old
-- rows transiently drops the sum to 0 and the trigger throws before the new rows
-- are inserted (this is also why the old two-call path was fragile). A sum
-- invariant is a transaction-end property, so convert it to a DEFERRABLE
-- INITIALLY DEFERRED constraint trigger — the replace commits atomically and the
-- sum is validated once at commit. (Same function; no test relies on immediate firing.)
DROP TRIGGER IF EXISTS opportunity_splits_sum_trigger ON public.opportunity_splits;
CREATE CONSTRAINT TRIGGER opportunity_splits_sum_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.opportunity_splits
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_opportunity_splits_sum();

CREATE OR REPLACE FUNCTION public.replace_opportunity_splits(_opportunity_id uuid, _rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.current_user_role() <> 'admin' THEN
    RAISE EXCEPTION 'not authorised to modify splits for opportunity %', _opportunity_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Serialise concurrent replaces on the same opportunity (last-write-wins).
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
$$;
REVOKE ALL ON FUNCTION public.replace_opportunity_splits(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.replace_opportunity_splits(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.replace_opportunity_team_members(_opportunity_id uuid, _rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.current_user_role() <> 'admin' THEN
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
$$;
REVOKE ALL ON FUNCTION public.replace_opportunity_team_members(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.replace_opportunity_team_members(uuid, jsonb) TO authenticated;
