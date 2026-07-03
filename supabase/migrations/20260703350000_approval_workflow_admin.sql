-- supabase/migrations/20260703350000_approval_workflow_admin.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (approval subsystem RPCs).
--
-- ORR-604 Phase 2 (admin GUI support):
--   * replace_workflow_steps(workflow, jsonb) — atomic admin-only replace of a
--     workflow's step template (delete + insert in one txn, mirroring
--     replace_account_tax_ids — a two-call replace risks wiping the chain).
--   * Defence-in-depth hardening (CTO review of Phase 1): the authz guards in
--     submit_opportunity_for_approval / record_approval_decision used
--     `IF NOT (<expr>) THEN RAISE`, which SKIPS the RAISE if <expr> is NULL.
--     That state is unreachable today (every auth user has a users row with a
--     NOT NULL role), but switch to `IS NOT TRUE` so a NULL can never re-open the
--     authz hole. Behaviour is otherwise identical.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. replace_workflow_steps — atomic admin-only step-template replace
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.replace_workflow_steps(_workflow_id uuid, _steps jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'only admins may edit approval workflows'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1 FROM public.approval_workflows WHERE id = _workflow_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval workflow % not found', _workflow_id USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.approval_workflow_steps WHERE workflow_id = _workflow_id;

  INSERT INTO public.approval_workflow_steps (workflow_id, step_order, approver_role, approver_user_id)
  SELECT _workflow_id,
         (elem->>'step_order')::int,
         NULLIF(elem->>'approver_role', '')::public.user_role,
         NULLIF(elem->>'approver_user_id', '')::uuid
  FROM jsonb_array_elements(coalesce(_steps, '[]'::jsonb)) AS elem;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_workflow_steps(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.replace_workflow_steps(uuid, jsonb) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Hardening: NULL-proof the authz guards (IS NOT TRUE)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.submit_opportunity_for_approval(_opportunity_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid         uuid := auth.uid();
  _entity_id   uuid;
  _workflow_id uuid;
  _instance_id uuid;
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

  SELECT id INTO _workflow_id FROM public.approval_workflows
  WHERE entity_type = 'opportunity' AND active AND entity_id = _entity_id
  ORDER BY created_at LIMIT 1;
  IF _workflow_id IS NULL THEN
    SELECT id INTO _workflow_id FROM public.approval_workflows
    WHERE entity_type = 'opportunity' AND active AND entity_id IS NULL
    ORDER BY created_at LIMIT 1;
  END IF;
  IF _workflow_id IS NULL THEN
    RAISE EXCEPTION 'no approval workflow configured for opportunities' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.approval_instances (workflow_id, entity_type, entity_id, status, triggered_by_user_id)
  VALUES (_workflow_id, 'opportunity', _opportunity_id, 'pending', _uid)
  RETURNING id INTO _instance_id;

  INSERT INTO public.approval_steps (instance_id, step_order, approver_role, approver_user_id, status)
  SELECT _instance_id, s.step_order, s.approver_role, s.approver_user_id, 'pending'
  FROM public.approval_workflow_steps s
  WHERE s.workflow_id = _workflow_id
  ORDER BY s.step_order;

  IF NOT EXISTS (SELECT 1 FROM public.approval_steps WHERE instance_id = _instance_id) THEN
    UPDATE public.approval_instances SET status = 'approved' WHERE id = _instance_id;
  END IF;

  RETURN _instance_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_approval_decision(
  _step_id  uuid,
  _decision public.approval_decision_type,
  _comment  text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid              uuid := auth.uid();
  _instance_id      uuid;
  _step_order       int;
  _step_status      public.approval_step_status;
  _approver_role    public.user_role;
  _approver_user_id uuid;
  _remaining        int;
BEGIN
  SELECT instance_id, step_order, status, approver_role, approver_user_id
    INTO _instance_id, _step_order, _step_status, _approver_role, _approver_user_id
  FROM public.approval_steps WHERE id = _step_id FOR UPDATE;

  IF _instance_id IS NULL THEN
    RAISE EXCEPTION 'approval step % not found', _step_id USING ERRCODE = '23503';
  END IF;

  IF (
    (_approver_user_id IS NOT NULL AND _approver_user_id = _uid)
    OR (_approver_role IS NOT NULL AND public.current_user_role() = _approver_role)
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

  INSERT INTO public.approval_decisions (step_id, decided_by_user_id, decision, comment)
  VALUES (_step_id, _uid, _decision, _comment);

  IF _decision = 'rejected' THEN
    UPDATE public.approval_steps SET status = 'rejected' WHERE id = _step_id;
    UPDATE public.approval_instances SET status = 'rejected' WHERE id = _instance_id;
  ELSE
    UPDATE public.approval_steps
      SET status = (CASE WHEN _decision = 'skipped' THEN 'skipped' ELSE 'approved' END)::public.approval_step_status
      WHERE id = _step_id;
    SELECT count(*) INTO _remaining
      FROM public.approval_steps WHERE instance_id = _instance_id AND status = 'pending';
    IF _remaining = 0 THEN
      UPDATE public.approval_instances SET status = 'approved' WHERE id = _instance_id;
    END IF;
  END IF;
END;
$$;
