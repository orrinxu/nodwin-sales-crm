-- supabase/migrations/20260705000000_fix_submit_rpc_multi_approver.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (approval subsystem + RLS-bypassing RPCs).
--
-- ORR-638 Fix submit RPC — materialize multi-approver + snapshot.
--
-- The submit_opportunity_for_approval and record_approval_decision RPCs
-- created in earlier migrations predate the multi-approver schema extensions
-- (approver_user_ids[], mode, workflow_snapshot). This migration brings them
-- up to date:
--
--   * submit_opportunity_for_approval:
--     - Materializes approver_user_ids[], mode, and name from template steps
--       into runtime approval_steps.
--     - Sets opportunity_id, trigger_stage, and workflow_snapshot on the
--       approval_instances row.
--   * record_approval_decision:
--     - Authz extended to recognise approver_user_ids[] (any member of the
--       array may decide).
--     - Prevents duplicate votes from the same user on all_required steps.
--     - any_one mode: step completes on the first non-rejected decision.
--     - all_required mode: step completes only after every listed approver
--       has cast a decision.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Add name column to approval_steps (runtime) so it can be materialized from
--    the template layer (approval_workflow_steps.name) at submit time.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.approval_steps
  ADD COLUMN IF NOT EXISTS name text;

COMMENT ON COLUMN public.approval_steps.name IS
  'Human-readable step label materialised from the template at submit time.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. submit_opportunity_for_approval — multi-approver materialization + snapshot
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.submit_opportunity_for_approval(_opportunity_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid         uuid := auth.uid();
  _manager     uuid;
  _entity_id   uuid;
  _workflow_id uuid;
  _instance_id uuid;
  _stage       public.deal_stage;
  _snapshot    jsonb;
BEGIN
  IF public.can_manage_opportunity(_opportunity_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'not authorised to submit this opportunity for approval'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1 FROM public.opportunities WHERE id = _opportunity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'opportunity % not found', _opportunity_id USING ERRCODE = '23503';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.approval_instances
    WHERE entity_type = 'opportunity' AND entity_id = _opportunity_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'opportunity already has a pending approval' USING ERRCODE = '23505';
  END IF;

  SELECT bu.entity_id INTO _entity_id
  FROM public.opportunities o
  JOIN public.business_units bu ON bu.id = o.sales_unit_id
  WHERE o.id = _opportunity_id;

  SELECT manager_user_id INTO _manager FROM public.users WHERE id = _uid;

  SELECT id, trigger_stage INTO _workflow_id, _stage FROM public.approval_workflows
  WHERE entity_type = 'opportunity' AND active AND entity_id = _entity_id
  ORDER BY created_at LIMIT 1;
  IF _workflow_id IS NULL THEN
    SELECT id, trigger_stage INTO _workflow_id, _stage FROM public.approval_workflows
    WHERE entity_type = 'opportunity' AND active AND entity_id IS NULL
    ORDER BY created_at LIMIT 1;
  END IF;
  IF _workflow_id IS NULL THEN
    RAISE EXCEPTION 'no approval workflow configured for opportunities' USING ERRCODE = '23503';
  END IF;

  -- Materialize the entire workflow definition as a JSON snapshot for audit.
  SELECT jsonb_build_object(
    'id', w.id,
    'name', w.name,
    'entity_type', w.entity_type,
    'entity_id', w.entity_id,
    'trigger_stage', w.trigger_stage,
    'enforce_gate', w.enforce_gate,
    'steps', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'step_order', s.step_order,
        'approver_kind', s.approver_kind,
        'approver_role', s.approver_role,
        'approver_user_id', s.approver_user_id,
        'approver_user_ids', to_jsonb(s.approver_user_ids),
        'mode', s.mode,
        'name', s.name
      ) ORDER BY s.step_order)
      FROM public.approval_workflow_steps s WHERE s.workflow_id = w.id),
      '[]'::jsonb
    )
  ) INTO _snapshot
  FROM public.approval_workflows w WHERE w.id = _workflow_id;

  INSERT INTO public.approval_instances (
    workflow_id, entity_type, entity_id, business_entity_id, opportunity_id,
    trigger_stage, workflow_snapshot, status, triggered_by_user_id
  )
  VALUES (
    _workflow_id, 'opportunity', _opportunity_id, _entity_id, _opportunity_id,
    _stage, _snapshot, 'pending', _uid
  )
  RETURNING id INTO _instance_id;

  -- Instantiate steps, resolving the approver by kind AND copying the
  -- multi-approver columns (approver_user_ids, mode, name) from the template.
  -- A 'manager' step with no manager on file escalates to admin so the chain
  -- can't get stuck.
  INSERT INTO public.approval_steps (
    instance_id, step_order, approver_role, approver_user_id,
    approver_user_ids, mode, name, status
  )
  SELECT _instance_id, s.step_order,
    CASE
      WHEN s.approver_kind = 'role' THEN s.approver_role
      WHEN s.approver_kind = 'manager' AND _manager IS NULL THEN 'admin'::public.user_role
      ELSE NULL
    END,
    CASE
      WHEN s.approver_kind = 'user' THEN s.approver_user_id
      WHEN s.approver_kind = 'manager' THEN _manager
      ELSE NULL
    END,
    s.approver_user_ids,
    s.mode,
    s.name,
    'pending'
  FROM public.approval_workflow_steps s
  WHERE s.workflow_id = _workflow_id
  ORDER BY s.step_order;

  IF NOT EXISTS (SELECT 1 FROM public.approval_steps WHERE instance_id = _instance_id) THEN
    UPDATE public.approval_instances SET status = 'approved' WHERE id = _instance_id;
  END IF;

  RETURN _instance_id;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. record_approval_decision — multi-approver authz + mode-aware completion
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.record_approval_decision(
  _step_id  uuid,
  _decision public.approval_decision_type,
  _comment  text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid               uuid := auth.uid();
  _instance_id       uuid;
  _step_order        int;
  _step_status       public.approval_step_status;
  _approver_role     public.user_role;
  _approver_user_id  uuid;
  _approver_user_ids uuid[];
  _mode              public.approval_step_mode;
  _business_entity   uuid;
  _remaining         int;
  _required_count    int;
  _decided_count     int;
BEGIN
  SELECT instance_id, step_order, status, approver_role, approver_user_id,
         approver_user_ids, mode
    INTO _instance_id, _step_order, _step_status, _approver_role, _approver_user_id,
         _approver_user_ids, _mode
  FROM public.approval_steps WHERE id = _step_id FOR UPDATE;

  IF _instance_id IS NULL THEN
    RAISE EXCEPTION 'approval step % not found', _step_id USING ERRCODE = '23503';
  END IF;

  SELECT business_entity_id INTO _business_entity
    FROM public.approval_instances WHERE id = _instance_id;

  -- Authz: named-user approver, member of approver_user_ids[], role approver
  -- (entity-firewalled), or admin.
  IF (
    (_approver_user_id IS NOT NULL AND _approver_user_id = _uid)
    OR (_approver_user_ids IS NOT NULL AND _uid = ANY(_approver_user_ids))
    OR (
      _approver_role IS NOT NULL
      AND public.current_user_role() = _approver_role
      AND _business_entity = (SELECT primary_entity_id FROM public.users WHERE id = _uid)
    )
    OR public.current_user_role() = 'admin'
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'not authorised to decide this approval step'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _step_status <> 'pending' THEN
    RAISE EXCEPTION 'approval step already decided' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.approval_steps
    WHERE instance_id = _instance_id AND status = 'pending' AND step_order < _step_order
  ) THEN
    RAISE EXCEPTION 'an earlier approval step is still pending' USING ERRCODE = 'check_violation';
  END IF;

  IF (SELECT status FROM public.approval_instances WHERE id = _instance_id) <> 'pending' THEN
    RAISE EXCEPTION 'approval already resolved' USING ERRCODE = 'check_violation';
  END IF;

  -- Prevent duplicate votes on all_required steps (the step stays pending
  -- until every approver has decided, so the _step_status <> 'pending' guard
  -- above is insufficient).
  IF _mode = 'all_required' AND EXISTS (
    SELECT 1 FROM public.approval_decisions
    WHERE step_id = _step_id AND decided_by_user_id = _uid
  ) THEN
    RAISE EXCEPTION 'you have already cast a decision on this step' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.approval_decisions (step_id, decided_by_user_id, decision, comment)
  VALUES (_step_id, _uid, _decision, _comment);

  -- Rejection is always final regardless of mode.
  IF _decision = 'rejected' THEN
    UPDATE public.approval_steps SET status = 'rejected' WHERE id = _step_id;
    UPDATE public.approval_instances SET status = 'rejected' WHERE id = _instance_id;
    RETURN;
  END IF;

  -- any_one mode (or legacy single-approver): step completes on the first
  -- non-rejected decision.
  IF _mode = 'any_one' OR (_approver_user_ids IS NULL) THEN
    UPDATE public.approval_steps
      SET status = (CASE WHEN _decision = 'skipped' THEN 'skipped' ELSE 'approved' END)::public.approval_step_status
      WHERE id = _step_id;

    SELECT count(*) INTO _remaining
      FROM public.approval_steps WHERE instance_id = _instance_id AND status = 'pending';
    IF _remaining = 0 THEN
      UPDATE public.approval_instances SET status = 'approved' WHERE id = _instance_id;
    END IF;
    RETURN;
  END IF;

  -- all_required mode: step completes only after every listed approver has
  -- cast a non-rejected decision.
  SELECT cardinality(
    ARRAY(SELECT DISTINCT unnest(_approver_user_ids)
          UNION SELECT _approver_user_id WHERE _approver_user_id IS NOT NULL)
  ) INTO _required_count;

  SELECT count(DISTINCT decided_by_user_id) INTO _decided_count
    FROM public.approval_decisions
    WHERE step_id = _step_id
      AND decided_by_user_id = ANY(
        ARRAY(SELECT DISTINCT unnest(_approver_user_ids)
              UNION SELECT _approver_user_id WHERE _approver_user_id IS NOT NULL)
      );

  IF _decided_count >= _required_count THEN
    UPDATE public.approval_steps SET status = 'approved' WHERE id = _step_id;

    SELECT count(*) INTO _remaining
      FROM public.approval_steps WHERE instance_id = _instance_id AND status = 'pending';
    IF _remaining = 0 THEN
      UPDATE public.approval_instances SET status = 'approved' WHERE id = _instance_id;
    END IF;
  END IF;
END;
$$;
