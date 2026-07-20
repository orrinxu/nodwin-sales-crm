-- supabase/migrations/20260719050000_approval_fixes_orr803.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (approval subsystem + RLS-bypassing RPCs).
--
-- ORR-803 — approval workflow fix cluster. Three DB changes:
--
--   (a) closed_lost exemption + (b) org-wide/entity deadlock:
--       opportunity_check_enforce_gate is rewritten so it evaluates only the ONE
--       workflow submit_opportunity_for_approval would resolve (entity-specific
--       active workflow, else the org-wide active default), instead of looping
--       over EVERY matching enforce_gate workflow. The old loop required an
--       approved instance per matching workflow, but submit only ever
--       instantiates one → an opp in an entity with its own workflow could never
--       satisfy the org-wide workflow's gate (permanent stuck deal). It now
--       gates on the governing workflow alone. A move to closed_lost is always
--       allowed, mirroring check_stage_transition ("moving to closed_lost is
--       always allowed") — you must always be able to record a loss.
--
--   (c) reassign_approval_step must rewrite the multi-approver array. Setting
--       only approver_user_id left approver_user_ids in place, so reassigning an
--       all_required step {A,B} to C GREW the required set to {A,B,C} and the
--       step could never complete. Reassign now makes the step a single named
--       approver (clears the array, the role, and sets any_one mode).
--
--   (d) staleness invalidation: invalidate_opportunity_approvals cancels any
--       APPROVED instance for an opportunity so a material change (amount/entity)
--       or a reopen forces fresh approval before the gates pass again. Called
--       from the updateOpportunity data layer.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- (a)+(b) enforce gate — evaluate only the governing workflow, exempt closed_lost
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.opportunity_check_enforce_gate(
  _opportunity_id uuid,
  _to_stage public.deal_stage
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _entity_id uuid;
  _wf_id     uuid;
  _enforce   boolean;
  _trigger   public.deal_stage;
BEGIN
  -- Moving to closed_lost is always allowed — a loss must always be recordable,
  -- exactly as check_stage_transition permits it regardless of ordinal.
  IF _to_stage = 'closed_lost'::public.deal_stage THEN
    RETURN true;
  END IF;

  -- Resolve the opportunity's business entity the same way
  -- submit_opportunity_for_approval does: business_units.entity_id via
  -- sales_unit_id (NOT billing_entity_id).
  SELECT bu.entity_id INTO _entity_id
  FROM public.opportunities o
  JOIN public.business_units bu ON bu.id = o.sales_unit_id
  WHERE o.id = _opportunity_id;

  -- Resolve the SINGLE workflow submit would instantiate: the entity-specific
  -- active workflow first, else the org-wide (entity_id IS NULL) active default.
  -- The gate must mirror submit — requiring approvals for workflows submit never
  -- instantiates is the deadlock we're fixing.
  SELECT id, enforce_gate, trigger_stage INTO _wf_id, _enforce, _trigger
  FROM public.approval_workflows
  WHERE entity_type = 'opportunity' AND active AND entity_id = _entity_id
  ORDER BY created_at LIMIT 1;

  IF _wf_id IS NULL THEN
    SELECT id, enforce_gate, trigger_stage INTO _wf_id, _enforce, _trigger
    FROM public.approval_workflows
    WHERE entity_type = 'opportunity' AND active AND entity_id IS NULL
    ORDER BY created_at LIMIT 1;
  END IF;

  -- No workflow governs this opportunity → nothing to gate.
  IF _wf_id IS NULL THEN
    RETURN true;
  END IF;

  -- The governing workflow does not enforce a gate.
  IF _enforce IS NOT TRUE THEN
    RETURN true;
  END IF;

  -- The move does not pass the workflow's trigger stage (enum labels are ordered
  -- by position: qualify < ... < closed_lost).
  IF _trigger IS NULL OR NOT (_trigger < _to_stage) THEN
    RETURN true;
  END IF;

  -- Gate is live: require an approved instance for THIS workflow.
  RETURN EXISTS (
    SELECT 1 FROM public.approval_instances ai
    WHERE ai.entity_type = 'opportunity'
      AND ai.entity_id = _opportunity_id
      AND ai.workflow_id = _wf_id
      AND ai.status = 'approved'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.opportunity_check_enforce_gate(uuid, public.deal_stage) FROM public;
GRANT EXECUTE ON FUNCTION public.opportunity_check_enforce_gate(uuid, public.deal_stage) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (c) reassign — collapse a step to a single named approver, rewriting the array
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reassign_approval_step(_step_id uuid, _new_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _step_status     public.approval_step_status;
  _instance_status public.approval_status;
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'only admins may reassign approvals' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = _new_user_id) THEN
    RAISE EXCEPTION 'user % not found', _new_user_id USING ERRCODE = '23503';
  END IF;

  SELECT s.status, i.status INTO _step_status, _instance_status
  FROM public.approval_steps s
  JOIN public.approval_instances i ON i.id = s.instance_id
  WHERE s.id = _step_id
  FOR UPDATE OF s;

  IF _step_status IS NULL THEN
    RAISE EXCEPTION 'approval step % not found', _step_id USING ERRCODE = '23503';
  END IF;
  IF _step_status <> 'pending' OR _instance_status <> 'pending' THEN
    RAISE EXCEPTION 'can only reassign a pending step of a pending approval'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Reassign the WHOLE step to one person. For a multi-approver (all_required)
  -- step this must also clear approver_user_ids — otherwise record_approval_decision
  -- keeps counting the old members in the required set (cardinality of
  -- approver_user_ids ∪ approver_user_id) and the step can never complete. Clear
  -- the role too and drop to any_one so the single approver's decision resolves
  -- the step.
  UPDATE public.approval_steps
  SET approver_user_id  = _new_user_id,
      approver_user_ids = NULL,
      approver_role     = NULL,
      mode              = 'any_one'
  WHERE id = _step_id;
END;
$$;
REVOKE ALL ON FUNCTION public.reassign_approval_step(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reassign_approval_step(uuid, uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- (d) staleness — invalidate approved instances on material change / reopen
-- ═══════════════════════════════════════════════════════════════════════════════
-- Cancels every APPROVED instance for an opportunity so the closed-won and
-- enforce gates (both EXISTS-any-approved) no longer pass on stale approval.
-- Conservative: pending instances (still in flight, decided against current data)
-- are left untouched; only already-approved instances are staled. Authorised by
-- can_manage_opportunity so it matches the write privilege of the caller editing
-- the deal. Returns the number of instances invalidated.
CREATE OR REPLACE FUNCTION public.invalidate_opportunity_approvals(_opportunity_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _count integer;
BEGIN
  IF public.can_manage_opportunity(_opportunity_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'not authorised to invalidate approvals for this opportunity'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  WITH updated AS (
    UPDATE public.approval_instances
    SET status = 'cancelled'
    WHERE entity_type = 'opportunity'
      AND entity_id = _opportunity_id
      AND status = 'approved'
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM updated;

  RETURN _count;
END;
$$;
REVOKE ALL ON FUNCTION public.invalidate_opportunity_approvals(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.invalidate_opportunity_approvals(uuid) TO authenticated;
