-- supabase/migrations/20260703330000_revenue_schedule_atomic_replace.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (RLS + write path on client financial data).
--
-- GH #148: saveCustomSchedule replaced an opportunity's revenue schedule with a
-- two-call DELETE-then-INSERT via supabase-js. That is NOT atomic: if the insert
-- failed after the delete committed (unique-month violation, timeout, transient
-- error) the opportunity was left with ZERO schedule rows — silent data loss.
--
-- Fix (mirrors the account_tax_ids RPC, ORR-622): a SECURITY DEFINER RPC that
-- does DELETE + INSERT in ONE transaction, authorises against the parent
-- opportunity, and locks the opportunity row for last-write-wins.
--
-- The authorisation rule for this table is "can see the parent opportunity"
-- (opportunity_visibility membership) OR admin — identical across all four
-- authenticated policies. We extract it into ONE helper so the RPC and the
-- policies can never drift, then repoint the existing policies at it. This is a
-- behaviour-preserving refactor: the predicate is copied verbatim.
--
-- Idempotent: safe to re-run.

-- ── Access helper (single source of truth for the visibility rule) ───────────
-- SECURITY DEFINER so it reads opportunity_visibility regardless of RLS; pinned
-- to auth.uid(), so it only ever answers for the CURRENT user.
CREATE OR REPLACE FUNCTION public.can_access_opportunity_schedule(_opportunity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = _opportunity_id
        AND user_id = auth.uid()
    );
$$;
REVOKE ALL ON FUNCTION public.can_access_opportunity_schedule(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_access_opportunity_schedule(uuid) TO authenticated;

-- ── Repoint the existing policies at the helper (behaviour-preserving) ───────
DROP POLICY IF EXISTS "opportunity_revenue_schedule_select_via_visibility" ON public.opportunity_revenue_schedule;
CREATE POLICY "opportunity_revenue_schedule_select_via_visibility"
  ON public.opportunity_revenue_schedule FOR SELECT TO authenticated
  USING (public.can_access_opportunity_schedule(opportunity_id));

DROP POLICY IF EXISTS "opportunity_revenue_schedule_insert_via_visibility" ON public.opportunity_revenue_schedule;
CREATE POLICY "opportunity_revenue_schedule_insert_via_visibility"
  ON public.opportunity_revenue_schedule FOR INSERT TO authenticated
  WITH CHECK (public.can_access_opportunity_schedule(opportunity_id));

DROP POLICY IF EXISTS "opportunity_revenue_schedule_update_via_visibility" ON public.opportunity_revenue_schedule;
CREATE POLICY "opportunity_revenue_schedule_update_via_visibility"
  ON public.opportunity_revenue_schedule FOR UPDATE TO authenticated
  USING (public.can_access_opportunity_schedule(opportunity_id))
  WITH CHECK (public.can_access_opportunity_schedule(opportunity_id));

DROP POLICY IF EXISTS "opportunity_revenue_schedule_delete_via_visibility" ON public.opportunity_revenue_schedule;
CREATE POLICY "opportunity_revenue_schedule_delete_via_visibility"
  ON public.opportunity_revenue_schedule FOR DELETE TO authenticated
  USING (public.can_access_opportunity_schedule(opportunity_id));

-- ── Atomic replace RPC (the web write path) ──────────────────────────────────
-- A duplicate month in the payload violates the UNIQUE(opportunity_id, month)
-- constraint; because DELETE + INSERT share one transaction, that failure rolls
-- the delete back too — the prior schedule survives instead of being wiped. An
-- empty array clears the schedule (delete, insert nothing). Amount/currency sum
-- validation stays in the caller (needs Money math); this RPC is the atomic
-- write primitive.
CREATE OR REPLACE FUNCTION public.replace_revenue_schedule(_opportunity_id uuid, _rows jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_access_opportunity_schedule(_opportunity_id) THEN
    RAISE EXCEPTION 'not authorised to modify the revenue schedule for opportunity %', _opportunity_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Serialise concurrent replaces on the same opportunity (last-write-wins).
  PERFORM 1 FROM public.opportunities WHERE id = _opportunity_id FOR UPDATE;

  DELETE FROM public.opportunity_revenue_schedule WHERE opportunity_id = _opportunity_id;

  INSERT INTO public.opportunity_revenue_schedule (opportunity_id, month, amount)
  SELECT _opportunity_id, (elem->>'month')::date, (elem->>'amount')::numeric
  FROM jsonb_array_elements(coalesce(_rows, '[]'::jsonb)) AS elem;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_revenue_schedule(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.replace_revenue_schedule(uuid, jsonb) TO authenticated;
