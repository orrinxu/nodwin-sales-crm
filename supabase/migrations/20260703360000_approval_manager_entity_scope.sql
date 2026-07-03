-- supabase/migrations/20260703360000_approval_manager_entity_scope.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (approval authz + RLS).
--
-- ORR-604 Phase 3a: approver model overhaul.
--   * Steps gain an approver_kind: 'manager' (the submitter's own manager),
--     'user' (a specific person — e.g. CFO/COO/CEO), or 'role' (entity-scoped).
--   * submit resolves 'manager' → the submitter's manager_user_id at submit time
--     (fallback to admin if the submitter has no manager), and records the opp's
--     business entity on the instance.
--   * Approvals are FIREWALLED by entity: a role-based approver may only
--     read/decide approvals for opportunities in THEIR OWN entity. (Named-user
--     and manager approvers are inherently scoped to one person.)
--   * The org-wide default workflow switches to a single "submitter's manager"
--     step.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. approver_kind on the step template + business entity on the instance
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.approval_workflow_steps
  ADD COLUMN IF NOT EXISTS approver_kind text NOT NULL DEFAULT 'role';

-- Backfill kind from the existing columns BEFORE the kind-aware CHECK is added.
-- Phase 2 permitted user-only steps (approver_user_id set, approver_role NULL);
-- the DEFAULT 'role' would mislabel those and violate the new CHECK, aborting the
-- migration. Role takes precedence if somehow both are set.
UPDATE public.approval_workflow_steps SET approver_kind = 'role'
  WHERE approver_role IS NOT NULL;
UPDATE public.approval_workflow_steps SET approver_kind = 'user'
  WHERE approver_role IS NULL AND approver_user_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_awf_steps_kind'
  ) THEN
    ALTER TABLE public.approval_workflow_steps
      ADD CONSTRAINT chk_awf_steps_kind CHECK (approver_kind IN ('manager', 'role', 'user'));
  END IF;
END $$;

-- Replace the old "role or user required" check with a kind-aware one:
--   manager → neither needed; role → approver_role; user → approver_user_id.
ALTER TABLE public.approval_workflow_steps
  DROP CONSTRAINT IF EXISTS chk_awf_steps_approver;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_awf_steps_approver_by_kind'
  ) THEN
    ALTER TABLE public.approval_workflow_steps
      ADD CONSTRAINT chk_awf_steps_approver_by_kind CHECK (
        (approver_kind = 'manager')
        OR (approver_kind = 'role' AND approver_role IS NOT NULL)
        OR (approver_kind = 'user' AND approver_user_id IS NOT NULL)
      );
  END IF;
END $$;

-- The resolved business entity of the approved item, recorded at submit time so
-- entity firewalling is a cheap column compare (not a repeated 2-join lookup).
ALTER TABLE public.approval_instances
  ADD COLUMN IF NOT EXISTS business_entity_id uuid REFERENCES public.entities(id);

-- Backfill existing opportunity approval instances so in-flight approvals created
-- before this migration are firewalled (not left NULL → fail-open). Instances
-- whose opportunity's business_unit has no entity stay NULL and fail CLOSED below.
UPDATE public.approval_instances i
SET business_entity_id = bu.entity_id
FROM public.opportunities o
JOIN public.business_units bu ON bu.id = o.sales_unit_id
WHERE i.entity_type = 'opportunity'
  AND i.entity_id = o.id
  AND i.business_entity_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Switch the org-wide default workflow to "submitter's manager"
-- ═══════════════════════════════════════════════════════════════════════════════
UPDATE public.approval_workflow_steps s
SET approver_kind = 'manager', approver_role = NULL, approver_user_id = NULL
FROM public.approval_workflows w
WHERE s.workflow_id = w.id
  AND w.entity_type = 'opportunity' AND w.entity_id IS NULL
  AND s.approver_kind = 'role' AND s.approver_role = 'sales_manager';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. replace_workflow_steps — accept approver_kind
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

  INSERT INTO public.approval_workflow_steps (workflow_id, step_order, approver_kind, approver_role, approver_user_id)
  SELECT _workflow_id,
         (elem->>'step_order')::int,
         coalesce(NULLIF(elem->>'approver_kind', ''), 'role'),
         NULLIF(elem->>'approver_role', '')::public.user_role,
         NULLIF(elem->>'approver_user_id', '')::uuid
  FROM jsonb_array_elements(coalesce(_steps, '[]'::jsonb)) AS elem;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. submit — resolve manager, record business entity
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.submit_opportunity_for_approval(_opportunity_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid         uuid := auth.uid();
  _manager     uuid;
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

  SELECT manager_user_id INTO _manager FROM public.users WHERE id = _uid;

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

  INSERT INTO public.approval_instances (workflow_id, entity_type, entity_id, business_entity_id, status, triggered_by_user_id)
  VALUES (_workflow_id, 'opportunity', _opportunity_id, _entity_id, 'pending', _uid)
  RETURNING id INTO _instance_id;

  -- Instantiate steps, resolving the approver by kind. A 'manager' step with no
  -- manager on file escalates to admin so the chain can't get stuck.
  INSERT INTO public.approval_steps (instance_id, step_order, approver_role, approver_user_id, status)
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
-- 5. record_approval_decision — entity-firewalled role authz
-- ═══════════════════════════════════════════════════════════════════════════════
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
  _business_entity  uuid;
  _remaining        int;
BEGIN
  SELECT instance_id, step_order, status, approver_role, approver_user_id
    INTO _instance_id, _step_order, _step_status, _approver_role, _approver_user_id
  FROM public.approval_steps WHERE id = _step_id FOR UPDATE;

  IF _instance_id IS NULL THEN
    RAISE EXCEPTION 'approval step % not found', _step_id USING ERRCODE = '23503';
  END IF;

  SELECT business_entity_id INTO _business_entity
    FROM public.approval_instances WHERE id = _instance_id;

  -- Named-user approver: exactly that person. Role approver: a holder of the role
  -- WHO BELONGS TO THE OPP'S ENTITY (firewalled). Admin: always.
  IF (
    (_approver_user_id IS NOT NULL AND _approver_user_id = _uid)
    OR (
      _approver_role IS NOT NULL
      AND public.current_user_role() = _approver_role
      -- Firewall: role approver must belong to the opp's entity. Fails CLOSED if
      -- the instance has no business entity (only admin/named approver can act).
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Read RLS — entity-firewalled role visibility
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.can_read_approval_instance(_instance_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_user_role() = 'admin'
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
          OR (
            s.approver_role IS NOT NULL
            AND public.current_user_role() = s.approver_role
            -- Firewall (fails closed on NULL business entity — see decision RPC).
            AND i.business_entity_id = (SELECT primary_entity_id FROM public.users WHERE id = auth.uid())
          )
        )
    );
$$;
