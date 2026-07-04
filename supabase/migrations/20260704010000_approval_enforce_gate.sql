-- supabase/migrations/20260704000000_approval_enforce_gate.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (approval subsystem + RLS-bypassing RPCs).
--
-- ORR-604 Phase 4: enforce_gate — block stage advance past trigger_stage
-- until the approval is approved.
--
-- Adds:
--   * enforce_gate (boolean, default false) on approval_workflows
--   * trigger_stage (deal_stage) on approval_workflows
--   * opportunity_check_enforce_gate() SECURITY DEFINER RPC
--
-- v1 defaults: enforce_gate = false (record-only mode). Admins may toggle it
-- per workflow later.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Add enforce_gate + trigger_stage columns to approval_workflows
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.approval_workflows
  ADD COLUMN IF NOT EXISTS enforce_gate  boolean        NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trigger_stage public.deal_stage;

COMMENT ON COLUMN public.approval_workflows.enforce_gate IS
  'When true, a stage advance past trigger_stage is blocked until an approved approval_instance exists for the entity.';
COMMENT ON COLUMN public.approval_workflows.trigger_stage IS
  'The deal stage at which the approval workflow triggers (auto-submit). Beyond this stage, enforce_gate blocks further advances.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. opportunity_check_enforce_gate RPC
--
-- Called from the app-level guard before any stage advance. Returns true when
-- the target stage is allowed (no blocking gate, or every enforce_gate workflow
-- has an approved instance). Returns false when at least one enforce_gate
-- workflow with a trigger_stage below the target stage is missing an approved
-- instance — the caller MUST reject the transition.
--
-- SECURITY DEFINER so the check is correct regardless of RLS scoping on
-- approval_instances (the closing rep may not be able to see the instance
-- under RLS, but the gate must still be enforced).
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.opportunity_check_enforce_gate(
  _opportunity_id uuid,
  _to_stage public.deal_stage
)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _billing_entity_id uuid;
  _rec record;
BEGIN
  -- Resolve the opportunity's billing entity so we match per-entity workflows.
  SELECT billing_entity_id INTO _billing_entity_id
  FROM public.opportunities WHERE id = _opportunity_id;

  FOR _rec IN
    SELECT w.id
    FROM public.approval_workflows w
    WHERE w.entity_type = 'opportunity'
      AND w.enforce_gate = true
      AND w.trigger_stage IS NOT NULL
      -- Postgres enums are ordered by label position in the type definition:
      -- qualify(1) < meet_and_present(2) < ... < closed_lost(7).
      -- A move to _to_stage "passes" trigger_stage when _to_stage > trigger_stage.
      AND w.trigger_stage < _to_stage
      AND (w.entity_id = _billing_entity_id OR w.entity_id IS NULL)
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

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. approval_step_mode enum (added in ORR-608 — schema was live but migration
--    wasn't committed)
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'approval_step_mode'
  ) THEN
    CREATE TYPE public.approval_step_mode AS ENUM ('any_one', 'all_required');
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Updated replace_workflow_steps — handle ORR-608 step columns
--    (approver_user_ids, name, mode). The previous version from
--    20260703360000 only handled approver_kind/role/user_id.
--    This is a CREATE OR REPLACE — safe to re-run and bumps the function
--    to match the full schema.
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

  INSERT INTO public.approval_workflow_steps (
    workflow_id, step_order, approver_kind, approver_role,
    approver_user_id, approver_user_ids, name, mode
  )
  SELECT _workflow_id,
         (elem->>'step_order')::int,
         coalesce(NULLIF(elem->>'approver_kind', ''), 'role'),
         NULLIF(elem->>'approver_role', '')::public.user_role,
         NULLIF(elem->>'approver_user_id', '')::uuid,
         CASE
           WHEN jsonb_typeof(elem->'approver_user_ids') = 'array'
             THEN ARRAY(SELECT jsonb_array_elements_text(elem->'approver_user_ids'))::uuid[]
           ELSE NULL
         END,
         NULLIF(elem->>'name', ''),
         coalesce(
           NULLIF(elem->>'mode', '')::public.approval_step_mode,
           'all_required'::public.approval_step_mode
         )
  FROM jsonb_array_elements(coalesce(_steps, '[]'::jsonb)) AS elem;
END;
$$;
REVOKE ALL ON FUNCTION public.replace_workflow_steps(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.replace_workflow_steps(uuid, jsonb) TO authenticated;
