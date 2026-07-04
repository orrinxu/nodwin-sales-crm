-- supabase/policies/approval_workflows.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for the approval workflow subsystem tables.
-- These are also embedded in 20260506000004_approval_workflows.sql so the
-- migration is self-contained.  This file exists for security-review readability.
--
-- (ORR-309 / T-028)

-- ── approval_workflows ────────────────────────────────────────────────────────
ALTER TABLE public.approval_workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_workflows_select_admin" ON public.approval_workflows;
CREATE POLICY "approval_workflows_select_admin"
  ON public.approval_workflows
  FOR SELECT
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "approval_workflows_insert_admin" ON public.approval_workflows;
CREATE POLICY "approval_workflows_insert_admin"
  ON public.approval_workflows
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "approval_workflows_update_admin" ON public.approval_workflows;
CREATE POLICY "approval_workflows_update_admin"
  ON public.approval_workflows
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "approval_workflows_delete_admin" ON public.approval_workflows;
CREATE POLICY "approval_workflows_delete_admin"
  ON public.approval_workflows
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ── approval_workflow_steps (template layer) ──────────────────────────────────
-- Mirrors business_units pattern: authenticated can read, admin-only writes.
ALTER TABLE public.approval_workflow_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_workflow_steps_select_authenticated" ON public.approval_workflow_steps;
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

-- ── approval_instances ────────────────────────────────────────────────────────
ALTER TABLE public.approval_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_instances_select_scoped" ON public.approval_instances;
CREATE POLICY "approval_instances_select_scoped"
  ON public.approval_instances
  FOR SELECT
  TO authenticated
  USING (public.can_read_approval_instance(id));

DROP POLICY IF EXISTS "approval_instances_insert_admin" ON public.approval_instances;
CREATE POLICY "approval_instances_insert_admin"
  ON public.approval_instances
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "approval_instances_update_admin" ON public.approval_instances;
CREATE POLICY "approval_instances_update_admin"
  ON public.approval_instances
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "approval_instances_delete_admin" ON public.approval_instances;
CREATE POLICY "approval_instances_delete_admin"
  ON public.approval_instances
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ── approval_steps ────────────────────────────────────────────────────────────
ALTER TABLE public.approval_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_steps_select_scoped" ON public.approval_steps;
CREATE POLICY "approval_steps_select_scoped"
  ON public.approval_steps
  FOR SELECT
  TO authenticated
  USING (
    approver_user_id = auth.uid()
    OR auth.uid() = ANY (COALESCE(approver_user_ids, ARRAY[]::uuid[]))
    OR EXISTS (
      SELECT 1 FROM public.approval_instances
      WHERE id = public.approval_steps.instance_id
        AND triggered_by_user_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "approval_steps_insert_admin" ON public.approval_steps;
CREATE POLICY "approval_steps_insert_admin"
  ON public.approval_steps
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "approval_steps_update_admin" ON public.approval_steps;
CREATE POLICY "approval_steps_update_admin"
  ON public.approval_steps
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "approval_steps_delete_admin" ON public.approval_steps;
CREATE POLICY "approval_steps_delete_admin"
  ON public.approval_steps
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- ── approval_decisions ────────────────────────────────────────────────────────
ALTER TABLE public.approval_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_decisions_select_scoped" ON public.approval_decisions;
CREATE POLICY "approval_decisions_select_scoped"
  ON public.approval_decisions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_steps
      WHERE id = public.approval_decisions.step_id
        AND (
          approver_user_id = auth.uid()
          OR auth.uid() = ANY (COALESCE(approver_user_ids, ARRAY[]::uuid[]))
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.approval_steps s
      JOIN   public.approval_instances i ON i.id = s.instance_id
      WHERE s.id = public.approval_decisions.step_id
        AND i.triggered_by_user_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "approval_decisions_insert_approver_or_admin" ON public.approval_decisions;
CREATE POLICY "approval_decisions_insert_approver_or_admin"
  ON public.approval_decisions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.approval_steps
      WHERE id = step_id
        AND (
          approver_user_id = auth.uid()
          OR auth.uid() = ANY (COALESCE(approver_user_ids, ARRAY[]::uuid[]))
        )
    )
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "approval_decisions_update_admin" ON public.approval_decisions;
CREATE POLICY "approval_decisions_update_admin"
  ON public.approval_decisions
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

DROP POLICY IF EXISTS "approval_decisions_delete_admin" ON public.approval_decisions;
CREATE POLICY "approval_decisions_delete_admin"
  ON public.approval_decisions
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
