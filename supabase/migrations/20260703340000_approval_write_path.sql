-- supabase/migrations/20260703340000_approval_write_path.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (approval subsystem + RLS-bypassing RPCs).
--
-- ORR-604 Phase 1: the approval WRITE path for opportunities.
--
-- approval_instances/approval_steps INSERT+UPDATE are admin-only (see
-- 20260506000004), so reps can't submit and non-admin approvers can't decide via
-- the authenticated client. This adds two SECURITY DEFINER RPCs that perform the
-- writes with explicit authorisation, plus a per-(business-)entity workflow model
-- so different entities route to different approval chains.
--
--   * approval_workflows gains entity_id (→ entities, NULL = org-wide default)
--     and active.
--   * approval_workflow_steps: the step TEMPLATE per workflow (the chain).
--   * a seeded org-wide default workflow (single sales_manager step).
--   * submit_opportunity_for_approval(opp) / record_approval_decision(step,...).
--
-- Deferred to later phases: admin GUI to author per-entity workflows, and
-- amount-threshold gating (enforce_gate).
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Per-entity scope on approval_workflows
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.approval_workflows
  ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES public.entities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Resolve "the workflow for this entity + type" quickly.
CREATE INDEX IF NOT EXISTS idx_approval_workflows_entity_lookup
  ON public.approval_workflows(entity_type, entity_id) WHERE active;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. approval_workflow_steps — the step template (the chain) per workflow
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.approval_workflow_steps (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id      uuid NOT NULL REFERENCES public.approval_workflows(id) ON DELETE CASCADE,
  step_order       int  NOT NULL,
  approver_role    public.user_role,
  approver_user_id uuid REFERENCES public.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_by       uuid,
  UNIQUE (workflow_id, step_order),
  CONSTRAINT chk_awf_steps_approver CHECK (approver_role IS NOT NULL OR approver_user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_approval_workflow_steps_workflow_id
  ON public.approval_workflow_steps(workflow_id);

COMMENT ON TABLE public.approval_workflow_steps IS
  'Ordered approver chain (template) for an approval_workflow. Instantiated into '
  'approval_steps when an entity is submitted for approval (ORR-604).';

CREATE OR REPLACE FUNCTION public.set_approval_workflow_step_audit_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approval_workflow_step_audit_fields_trigger ON public.approval_workflow_steps;
CREATE TRIGGER approval_workflow_step_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.approval_workflow_steps
  FOR EACH ROW EXECUTE FUNCTION public.set_approval_workflow_step_audit_fields();

SELECT audit.attach_trigger('public.approval_workflow_steps');

-- RLS: templates are configuration — admin-only (mirrors approval_workflows).
ALTER TABLE public.approval_workflow_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_workflow_steps_select_admin" ON public.approval_workflow_steps;
CREATE POLICY "approval_workflow_steps_select_admin"
  ON public.approval_workflow_steps FOR SELECT TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "approval_workflow_steps_insert_admin" ON public.approval_workflow_steps;
CREATE POLICY "approval_workflow_steps_insert_admin"
  ON public.approval_workflow_steps FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "approval_workflow_steps_update_admin" ON public.approval_workflow_steps;
CREATE POLICY "approval_workflow_steps_update_admin"
  ON public.approval_workflow_steps FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "approval_workflow_steps_delete_admin" ON public.approval_workflow_steps;
CREATE POLICY "approval_workflow_steps_delete_admin"
  ON public.approval_workflow_steps FOR DELETE TO authenticated
  USING (public.current_user_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Seed the org-wide default opportunity workflow (single sales_manager step)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _wf uuid;
BEGIN
  SELECT id INTO _wf FROM public.approval_workflows
  WHERE entity_type = 'opportunity' AND entity_id IS NULL
  ORDER BY created_at LIMIT 1;

  IF _wf IS NULL THEN
    INSERT INTO public.approval_workflows (name, description, entity_type, entity_id, active)
    VALUES ('Default Opportunity Approval',
            'Org-wide default: a single Sales Manager approval. Entities may define their own.',
            'opportunity', NULL, true)
    RETURNING id INTO _wf;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.approval_workflow_steps WHERE workflow_id = _wf) THEN
    INSERT INTO public.approval_workflow_steps (workflow_id, step_order, approver_role)
    VALUES (_wf, 1, 'sales_manager');
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3b. Read RLS: let role-based approvers SEE the approvals routed to their role
-- ═══════════════════════════════════════════════════════════════════════════════
-- The original policies (20260506000004) only matched a NAMED approver
-- (approver_user_id). With role-based steps a user holding the step's role must
-- also be able to read the instance/step/decision so the approver UI can show
-- them the pending approval.
--
-- The original instance/step policies cross-referenced each other with inline
-- EXISTS subqueries; adding the role clause tips that into "infinite recursion
-- detected in policy". So the visibility rule is centralised in ONE
-- SECURITY DEFINER helper (which bypasses RLS internally, breaking the cycle),
-- and all three SELECT policies delegate to it. The rule is a strict superset of
-- the originals (triggerer / named approver / admin) plus the role approver.
CREATE OR REPLACE FUNCTION public.can_read_approval_instance(_instance_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_user_role() = 'admin'
    OR EXISTS (
      SELECT 1 FROM public.approval_instances i
      WHERE i.id = _instance_id AND i.triggered_by_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.approval_steps s
      WHERE s.instance_id = _instance_id
        AND (
          s.approver_user_id = auth.uid()
          OR (s.approver_role IS NOT NULL AND public.current_user_role() = s.approver_role)
        )
    );
$$;
REVOKE ALL ON FUNCTION public.can_read_approval_instance(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_read_approval_instance(uuid) TO authenticated;

DROP POLICY IF EXISTS "approval_instances_select_scoped" ON public.approval_instances;
CREATE POLICY "approval_instances_select_scoped"
  ON public.approval_instances FOR SELECT TO authenticated
  USING (public.can_read_approval_instance(id));

DROP POLICY IF EXISTS "approval_steps_select_scoped" ON public.approval_steps;
CREATE POLICY "approval_steps_select_scoped"
  ON public.approval_steps FOR SELECT TO authenticated
  USING (public.can_read_approval_instance(instance_id));

DROP POLICY IF EXISTS "approval_decisions_select_scoped" ON public.approval_decisions;
CREATE POLICY "approval_decisions_select_scoped"
  ON public.approval_decisions FOR SELECT TO authenticated
  USING (
    public.can_read_approval_instance(
      (SELECT s.instance_id FROM public.approval_steps s WHERE s.id = public.approval_decisions.step_id)
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Authorisation helper: who may submit an opportunity for approval
-- ═══════════════════════════════════════════════════════════════════════════════
-- Mirrors opportunities_update_owner_or_team_or_admin (owner / admin /
-- group_sales_lead / owner-or-contributor team member).
CREATE OR REPLACE FUNCTION public.can_manage_opportunity(_opportunity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.current_user_role() IN ('admin', 'group_sales_lead')
    OR EXISTS (
      SELECT 1 FROM public.opportunities o
      WHERE o.id = _opportunity_id AND o.owner_user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.opportunity_team_members tm
      WHERE tm.opportunity_id = _opportunity_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'contributor')
    );
$$;
REVOKE ALL ON FUNCTION public.can_manage_opportunity(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_manage_opportunity(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. submit_opportunity_for_approval
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.submit_opportunity_for_approval(_opportunity_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid         uuid := auth.uid();
  _entity_id   uuid;
  _workflow_id uuid;
  _instance_id uuid;
BEGIN
  IF NOT public.can_manage_opportunity(_opportunity_id) THEN
    RAISE EXCEPTION 'not authorised to submit this opportunity for approval'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Serialise + block a second pending submission for the same opportunity.
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

  -- Resolve the opportunity's business entity via its sales unit.
  SELECT bu.entity_id INTO _entity_id
  FROM public.opportunities o
  JOIN public.business_units bu ON bu.id = o.sales_unit_id
  WHERE o.id = _opportunity_id;

  -- The entity's active opportunity workflow, else the org-wide default.
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

  -- A step-less workflow auto-approves.
  IF NOT EXISTS (SELECT 1 FROM public.approval_steps WHERE instance_id = _instance_id) THEN
    UPDATE public.approval_instances SET status = 'approved' WHERE id = _instance_id;
  END IF;

  RETURN _instance_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_opportunity_for_approval(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_opportunity_for_approval(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. record_approval_decision
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
  _remaining        int;
BEGIN
  SELECT instance_id, step_order, status, approver_role, approver_user_id
    INTO _instance_id, _step_order, _step_status, _approver_role, _approver_user_id
  FROM public.approval_steps WHERE id = _step_id FOR UPDATE;

  IF _instance_id IS NULL THEN
    RAISE EXCEPTION 'approval step % not found', _step_id USING ERRCODE = '23503';
  END IF;

  -- Authorise: the named approver, a holder of the step's role, or an admin.
  -- NB: approver_user_id is NULL for role-based steps, so it must be guarded —
  -- `NULL = _uid` is NULL and would poison the whole OR chain, skipping the RAISE.
  IF NOT (
    (_approver_user_id IS NOT NULL AND _approver_user_id = _uid)
    OR (_approver_role IS NOT NULL AND public.current_user_role() = _approver_role)
    OR public.current_user_role() = 'admin'
  ) THEN
    RAISE EXCEPTION 'not authorised to decide this approval step'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _step_status <> 'pending' THEN
    RAISE EXCEPTION 'approval step already decided' USING ERRCODE = '23505';
  END IF;

  -- Steps are sequential: no earlier step may still be pending.
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
REVOKE ALL ON FUNCTION public.record_approval_decision(uuid, public.approval_decision_type, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_approval_decision(uuid, public.approval_decision_type, text) TO authenticated;
