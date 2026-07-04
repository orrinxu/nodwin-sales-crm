-- supabase/migrations/20260704000001_approval_rls_array_fix.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-608: Fix runtime RLS policies to check approver_user_ids[] in addition
-- to approver_user_id (singular).  Policies on approval_instances, approval_steps,
-- and approval_decisions must allow access when auth.uid() matches any element
-- of the array, not only the single-user column.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. approval_instances_select_scoped — use SECURITY DEFINER helper to avoid
--    infinite recursion with approval_steps_select_scoped policy.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "approval_instances_select_scoped" ON public.approval_instances;
CREATE POLICY "approval_instances_select_scoped"
  ON public.approval_instances
  FOR SELECT
  TO authenticated
  USING (public.can_read_approval_instance(id));

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. approval_steps_select_scoped — add approver_user_ids[] check
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. approval_decisions_select_scoped — add approver_user_ids[] check
-- ═══════════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. approval_decisions_insert_approver_or_admin — add approver_user_ids[] check
-- ═══════════════════════════════════════════════════════════════════════════════

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
