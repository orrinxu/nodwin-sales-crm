-- supabase/migrations/20260705000001_submit_decision_rpc.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- (ORR-639) Fix record_approval_decision RPC: multi-approver authz + aggregation.
--
-- 1. Updates record_approval_decision to support approver_user_ids[] in the
--    authorisation check (in addition to approver_user_id and approver_role).
-- 2. Adds mode-based decision aggregation (any_one vs all_required) so
--    all_required steps are only resolved when every approver has decided.
-- 3. Adds duplicate-decision prevention (same user can't decide twice).
-- 4. Tightens the approval_decisions INSERT RLS policy with the same checks
--    (step pending, array approver support, duplicate prevention).
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Replace record_approval_decision — multi-approver authz + aggregation
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
  _step_mode        public.approval_step_mode;
  _approver_role    public.user_role;
  _approver_user_id uuid;
  _approver_user_ids uuid[];
  _remaining        int;
  _approver_count   int;
  _decision_count   int;
BEGIN
  SELECT instance_id, step_order, status, mode, approver_role, approver_user_id, approver_user_ids
    INTO _instance_id, _step_order, _step_status, _step_mode,
         _approver_role, _approver_user_id, _approver_user_ids
  FROM public.approval_steps WHERE id = _step_id FOR UPDATE;

  IF _instance_id IS NULL THEN
    RAISE EXCEPTION 'approval step % not found', _step_id USING ERRCODE = '23503';
  END IF;

  -- Authorise: named approver, role holder, array member, or admin.
  IF NOT (
    (_approver_user_id IS NOT NULL AND _approver_user_id = _uid)
    OR (_approver_role IS NOT NULL AND public.current_user_role() = _approver_role)
    OR _uid = ANY (COALESCE(_approver_user_ids, ARRAY[]::uuid[]))
    OR public.current_user_role() = 'admin'
  ) THEN
    RAISE EXCEPTION 'not authorised to decide this approval step'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _step_status <> 'pending' THEN
    RAISE EXCEPTION 'approval step already decided' USING ERRCODE = '23505';
  END IF;

  -- Prevent duplicate decisions from the same user.
  IF EXISTS (
    SELECT 1 FROM public.approval_decisions
    WHERE step_id = _step_id AND decided_by_user_id = _uid
  ) THEN
    RAISE EXCEPTION 'you have already decided on this step' USING ERRCODE = '23505';
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

  -- Record the decision.
  INSERT INTO public.approval_decisions (step_id, decided_by_user_id, decision, comment)
  VALUES (_step_id, _uid, _decision, _comment);

  -- ── Mode-based aggregation ────────────────────────────────────────────────

  IF _decision = 'rejected' THEN
    -- Rejection always resolves the step (and instance) regardless of mode.
    UPDATE public.approval_steps SET status = 'rejected' WHERE id = _step_id;
    UPDATE public.approval_instances SET status = 'rejected' WHERE id = _instance_id;
    RETURN;
  END IF;

  IF _step_mode IS NULL OR _step_mode = 'any_one' THEN
    -- any_one (or legacy NULL): first decision resolves the step.
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

  IF _step_mode = 'all_required' THEN
    -- all_required: need ALL approvers to decide before resolving.
    _approver_count := COALESCE(cardinality(_approver_user_ids), 0);
    IF _approver_count = 0 AND _approver_user_id IS NOT NULL THEN
      _approver_count := 1;
    END IF;

    SELECT count(*) INTO _decision_count
      FROM public.approval_decisions WHERE step_id = _step_id;

    IF _decision_count < _approver_count THEN
      -- Not all approvers have decided yet — step stays pending.
      RETURN;
    END IF;

    -- All approvers have decided. Rejections were handled above.
    -- Mixed approved + skipped = approved; all skipped = skipped.
    UPDATE public.approval_steps
      SET status = (CASE WHEN EXISTS (
        SELECT 1 FROM public.approval_decisions d WHERE d.step_id = _step_id AND d.decision = 'approved'
      ) THEN 'approved' ELSE 'skipped' END)::public.approval_step_status
      WHERE id = _step_id;

    SELECT count(*) INTO _remaining
      FROM public.approval_steps WHERE instance_id = _instance_id AND status = 'pending';
    IF _remaining = 0 THEN
      UPDATE public.approval_instances SET status = 'approved' WHERE id = _instance_id;
    END IF;
    RETURN;
  END IF;

  -- Unknown mode: fall back to resolve immediately.
  UPDATE public.approval_steps
    SET status = (CASE WHEN _decision = 'skipped' THEN 'skipped' ELSE 'approved' END)::public.approval_step_status
    WHERE id = _step_id;

  SELECT count(*) INTO _remaining
    FROM public.approval_steps WHERE instance_id = _instance_id AND status = 'pending';
  IF _remaining = 0 THEN
    UPDATE public.approval_instances SET status = 'approved' WHERE id = _instance_id;
  END IF;
END;
$$;

-- Re-grant execution (original migration used REVOKE ALL + GRANT).
REVOKE ALL ON FUNCTION public.record_approval_decision(uuid, public.approval_decision_type, text) FROM public;
GRANT EXECUTE ON FUNCTION public.record_approval_decision(uuid, public.approval_decision_type, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Tighten approval_decisions INSERT RLS policy
--    - Support approver_user_ids[] (in line with 20260704000001)
--    - Ensure the step is still pending
--    - Prevent duplicate decisions from the same user
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "approval_decisions_insert_approver_or_admin" ON public.approval_decisions;
CREATE POLICY "approval_decisions_insert_approver_or_admin"
  ON public.approval_decisions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT status FROM public.approval_steps WHERE id = step_id) = 'pending'
    AND (
      EXISTS (
        SELECT 1 FROM public.approval_steps
        WHERE id = step_id
          AND (
            approver_user_id = auth.uid()
            OR auth.uid() = ANY (COALESCE(approver_user_ids, ARRAY[]::uuid[]))
          )
      )
      OR public.current_user_role() = 'admin'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.approval_decisions d
      WHERE d.step_id = step_id
        AND d.decided_by_user_id = auth.uid()
    )
  );
