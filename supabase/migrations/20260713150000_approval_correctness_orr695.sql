-- ORR-695 — approval correctness cluster
--
-- A) opportunity_check_enforce_gate scoped the gate to the opportunity's
--    billing_entity_id (nullable, independent of the sales unit). The rest of the
--    approval subsystem — submit_opportunity_for_approval, the entity firewall —
--    derives the opportunity's business entity from business_units.entity_id via
--    sales_unit_id. So an entity that configured an enforce-gate workflow (keyed
--    to its sales-unit entity) was silently skipped whenever billing_entity_id was
--    NULL or different: a fail-OPEN enforcement bug. Resolve the entity the same
--    way submit does.
--
-- B) There was no DB guarantee of a single pending approval per opportunity — only
--    an app/RPC-level EXISTS check under a row lock. A direct insert (admin RLS) or
--    a future second write path could create two pending instances. Add a partial
--    unique index so the single-pending invariant is DB-backed and the existing
--    23505 contract holds regardless of write path.

-- ── A. Fix enforce-gate entity resolution ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.opportunity_check_enforce_gate(
  _opportunity_id uuid,
  _to_stage public.deal_stage
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _entity_id uuid;
  _rec record;
BEGIN
  -- Resolve the opportunity's business entity exactly as
  -- submit_opportunity_for_approval does: business_units.entity_id via
  -- sales_unit_id (NOT billing_entity_id).
  SELECT bu.entity_id INTO _entity_id
  FROM public.opportunities o
  JOIN public.business_units bu ON bu.id = o.sales_unit_id
  WHERE o.id = _opportunity_id;

  FOR _rec IN
    SELECT w.id
    FROM public.approval_workflows w
    WHERE w.entity_type = 'opportunity'
      AND w.enforce_gate = true
      AND w.trigger_stage IS NOT NULL
      -- Postgres enums are ordered by label position: qualify(1) < ... < closed_lost(7).
      -- A move to _to_stage "passes" trigger_stage when _to_stage > trigger_stage.
      AND w.trigger_stage < _to_stage
      AND (w.entity_id = _entity_id OR w.entity_id IS NULL)
  LOOP
    -- This workflow should have been approved before advancing past its
    -- trigger_stage. Check whether an approved instance exists.
    IF NOT EXISTS (
      SELECT 1 FROM public.approval_instances ai
      WHERE ai.entity_type = 'opportunity'
        AND ai.entity_id = _opportunity_id
        AND ai.workflow_id = _rec.id
        AND ai.status = 'approved'
    ) THEN
      RETURN false; -- blocked
    END IF;
  END LOOP;

  RETURN true; -- all clear (or no enforce_gate workflow matched)
END;
$$;

REVOKE ALL ON FUNCTION public.opportunity_check_enforce_gate(uuid, public.deal_stage) FROM public;
GRANT EXECUTE ON FUNCTION public.opportunity_check_enforce_gate(uuid, public.deal_stage) TO authenticated;

-- ── B. One pending approval per opportunity, enforced at the DB ───────────────
-- Partial unique index: at most one pending instance per opportunity. Terminal
-- states (approved/rejected/cancelled) are excluded, so re-submitting after a
-- prior instance resolves is unaffected. Scoped to entity_type = 'opportunity'
-- (entity_id holds the opportunity id for that type) so other entity types aren't
-- constrained.
CREATE UNIQUE INDEX IF NOT EXISTS uq_approval_instances_one_pending_per_opp
  ON public.approval_instances (entity_id)
  WHERE entity_type = 'opportunity' AND status = 'pending';
