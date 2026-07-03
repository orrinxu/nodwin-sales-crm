-- supabase/migrations/20260703370000_approval_reassign_cancel.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (approval authz).
--
-- ORR-604 Phase 3b: admins can reassign a pending approval step to a different
-- person, or cancel an in-flight approval. Both admin-only SECURITY DEFINER RPCs
-- (approval tables are admin-write via RLS; the RPCs authorise explicitly).
--
-- Idempotent: safe to re-run.

-- ── Reassign a pending step to a specific new approver ───────────────────────
-- Turns the step into a named-user step for the new person (clears any role), so
-- only they can decide it. Only a pending step of a still-pending instance.
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

  UPDATE public.approval_steps
  SET approver_user_id = _new_user_id, approver_role = NULL
  WHERE id = _step_id;
END;
$$;
REVOKE ALL ON FUNCTION public.reassign_approval_step(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reassign_approval_step(uuid, uuid) TO authenticated;

-- ── Cancel an in-flight approval ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_approval_instance(_instance_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.current_user_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'only admins may cancel approvals' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1 FROM public.approval_instances WHERE id = _instance_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approval % not found', _instance_id USING ERRCODE = '23503';
  END IF;
  IF (SELECT status FROM public.approval_instances WHERE id = _instance_id) <> 'pending' THEN
    RAISE EXCEPTION 'can only cancel a pending approval' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.approval_instances SET status = 'cancelled' WHERE id = _instance_id;
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_approval_instance(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.cancel_approval_instance(uuid) TO authenticated;
