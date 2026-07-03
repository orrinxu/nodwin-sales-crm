-- supabase/migrations/20260704000000_approval_template_layer.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-608 Phase 0: Approval workflow template-layer schema.
--
--   * New enum approval_step_mode (any_one | all_required)
--   * SOW columns on approval_workflows: applies_to_entity_id, trigger_stage, enforce_gate
--   * Extend approval_workflow_steps (template): name, approver_user_ids[], mode
--   * Extend approval_steps (runtime): approver_user_ids[], mode
--   * Extend approval_instances: opportunity_id, workflow_snapshot, trigger_stage
--   * Update RLS on approval_workflow_steps: authenticated-read + admin-write
--   * Update can_read_approval_instance() + runtime RLS for approver_user_ids[]
--   * Seed East Asia defaults (Budget @ meet_and_present, Closure @ verbal_agreement)
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. approval_step_mode enum
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN   pg_namespace n ON n.oid = t.typnamespace
    WHERE  n.nspname = 'public' AND t.typname = 'approval_step_mode'
  ) THEN
    CREATE TYPE public.approval_step_mode AS ENUM (
      'any_one',
      'all_required'
    );
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. SOW columns on approval_workflows
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.approval_workflows
  ADD COLUMN IF NOT EXISTS applies_to_entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS trigger_stage public.deal_stage,
  ADD COLUMN IF NOT EXISTS enforce_gate boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_approval_workflows_trigger_stage
  ON public.approval_workflows(trigger_stage);

CREATE INDEX IF NOT EXISTS idx_approval_workflows_applies_to_entity
  ON public.approval_workflows(applies_to_entity_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Extend approval_workflow_steps — template layer
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.approval_workflow_steps
  ADD COLUMN IF NOT EXISTS name               text,
  ADD COLUMN IF NOT EXISTS approver_user_ids  uuid[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mode               public.approval_step_mode DEFAULT 'all_required';

COMMENT ON COLUMN public.approval_workflow_steps.approver_user_ids IS
  'Multiple approver user IDs. When mode = any_one, one approval suffices; when all_required, every listed user must approve.';
COMMENT ON COLUMN public.approval_workflow_steps.mode IS
  'any_one: any single user in approver_user_ids can approve. all_required: every user in approver_user_ids must approve.';
COMMENT ON COLUMN public.approval_workflow_steps.name IS
  'Human-readable label for this step (e.g. "Budget Review", "Legal Sign-off").';

-- Relax the template-layer check constraint so steps using approver_user_ids[]
-- are accepted alongside the existing approver_kind approach.
ALTER TABLE public.approval_workflow_steps
  DROP CONSTRAINT IF EXISTS chk_awf_steps_approver_by_kind;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_awf_steps_approver_v2'
  ) THEN
    ALTER TABLE public.approval_workflow_steps
      ADD CONSTRAINT chk_awf_steps_approver_v2 CHECK (
        (approver_kind = 'manager')
        OR (approver_kind = 'role' AND approver_role IS NOT NULL)
        OR (approver_kind = 'user' AND approver_user_id IS NOT NULL)
        OR (approver_user_ids IS NOT NULL AND array_length(approver_user_ids, 1) > 0)
      );
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Extend approval_steps — runtime layer
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.approval_steps
  ADD COLUMN IF NOT EXISTS approver_user_ids uuid[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS mode              public.approval_step_mode DEFAULT 'all_required';

-- Relax the check constraint on approval_steps so steps with approver_user_ids[]
-- (but NULL approver_user_id / approver_role) are valid.
ALTER TABLE public.approval_steps
  DROP CONSTRAINT IF EXISTS chk_approval_steps_approver;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_approval_steps_approver_v2'
  ) THEN
    ALTER TABLE public.approval_steps
      ADD CONSTRAINT chk_approval_steps_approver_v2 CHECK (
        approver_role IS NOT NULL
        OR approver_user_id IS NOT NULL
        OR (approver_user_ids IS NOT NULL AND array_length(approver_user_ids, 1) > 0)
      );
  END IF;
END $$;

COMMENT ON COLUMN public.approval_steps.approver_user_ids IS
  'Multiple approver user IDs (materialised from template at submit time).';
COMMENT ON COLUMN public.approval_steps.mode IS
  'Mode materialised from template. any_one: any listed user suffices. all_required: every listed user must approve.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Extend approval_instances — runtime layer
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.approval_instances
  ADD COLUMN IF NOT EXISTS opportunity_id   uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS workflow_snapshot jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trigger_stage    public.deal_stage DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_approval_instances_opportunity_id
  ON public.approval_instances(opportunity_id)
  WHERE opportunity_id IS NOT NULL;

COMMENT ON COLUMN public.approval_instances.opportunity_id IS
  'Direct FK to the triggering opportunity for fast lookup (denormalised).';
COMMENT ON COLUMN public.approval_instances.workflow_snapshot IS
  'JSON snapshot of the workflow definition at submit time for audit trail.';
COMMENT ON COLUMN public.approval_instances.trigger_stage IS
  'The deal stage that triggered this approval instance.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. RLS — approval_workflow_steps: authenticated-read + admin-write
--    Mirrors business_units pattern (USING true for SELECT, admin for writes).
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "approval_workflow_steps_select_admin" ON public.approval_workflow_steps;
CREATE POLICY "approval_workflow_steps_select_authenticated"
  ON public.approval_workflow_steps
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "approval_workflow_steps_insert_admin" ON public.approval_workflow_steps;
CREATE POLICY "approval_workflow_steps_insert_admin"
  ON public.approval_workflow_steps
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "approval_workflow_steps_update_admin" ON public.approval_workflow_steps;
CREATE POLICY "approval_workflow_steps_update_admin"
  ON public.approval_workflow_steps
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "approval_workflow_steps_delete_admin" ON public.approval_workflow_steps;
CREATE POLICY "approval_workflow_steps_delete_admin"
  ON public.approval_workflow_steps
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. Update can_read_approval_instance() — include approver_user_ids[]
--    Extends the existing SECURITY DEFINER helper to recognise the new column.
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
          OR auth.uid() = ANY (COALESCE(s.approver_user_ids, ARRAY[]::uuid[]))
          OR (
            s.approver_role IS NOT NULL
            AND public.current_user_role() = s.approver_role
            AND i.business_entity_id = (SELECT primary_entity_id FROM public.users WHERE id = auth.uid())
          )
        )
    );
$$;

-- Seed data for East Asia default approval workflows is in supabase/seed/sandbox.sql
-- (seeds run after all migrations, so entity FKs are already populated).
