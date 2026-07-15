-- supabase/migrations/20260715040000_direct_reports_self_service.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Direct-reports self-service roster (ORR-715 / T-141) — part 2 of 2.
--
-- O2 (ratified 2026-07-13): scoped managers may self-serve their direct-reports
-- roster WITHOUT admin co-sign. This deliberately relaxes the previously
-- Super-Admin-only `manager_user_id` write guard (prevent_role_escalation) — the
-- security-sensitive core of this ticket. It does NOT relax primary_role / role_id
-- (still admin-only), and the relaxation is tightly scoped:
--
--   * actor is a management role (sales_manager / regional_head / group_sales_lead);
--   * target is a sales_rep in the actor's OWN entity, and — if the actor has a
--     business unit — the actor's business unit (decided 2026-07-15);
--   * the only allowed changes are "claim to self" or "release a report I own".
--     A manager can never point a rep at an arbitrary third party, nor touch a
--     higher-role user, nor escalate anyone's role.
--
-- Manager visibility stays standard-tier only, so Confidential (D5) is unaffected.
-- Membership is effective-dated (manager_assignment_history) rather than hard
-- deleted, so period reports stay accurate. The reparent visibility recompute is
-- fixed to fan out over the moved user's whole subtree (previously only the moved
-- user's own deals were recomputed, leaving a new manager blind to subordinates).

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. Capability predicate — who may a manager claim as a direct report.
-- ════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.can_manage_direct_report(_manager uuid, _report uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.users m
      JOIN public.users r ON r.id = _report
     WHERE m.id = _manager
       AND _manager <> _report
       AND m.primary_role IN ('sales_manager', 'regional_head', 'group_sales_lead')
       AND r.primary_role = 'sales_rep'
       AND m.primary_entity_id IS NOT NULL
       AND r.primary_entity_id = m.primary_entity_id
       AND (m.primary_business_unit_id IS NULL
            OR r.primary_business_unit_id = m.primary_business_unit_id)
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_direct_report(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_manage_direct_report(uuid, uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. Relax the escalation guard for scoped self-serve roster changes only.
-- ════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _current_user_id uuid;
BEGIN
  _current_user_id := auth.uid();
  IF _current_user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE id = _current_user_id AND primary_role = 'admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.primary_role IS DISTINCT FROM OLD.primary_role THEN
    RAISE EXCEPTION 'Only admins can change primary_role' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.manager_user_id IS DISTINCT FROM OLD.manager_user_id THEN
    -- Self-serve roster (ORR-715): a scoped manager may CLAIM a rep (set the rep's
    -- manager to themselves) or RELEASE a rep they currently manage (clear it).
    -- Every other manager_user_id change stays admin-only.
    IF NOT (
      (NEW.manager_user_id = _current_user_id
        AND public.can_manage_direct_report(_current_user_id, NEW.id))
      OR (NEW.manager_user_id IS NULL AND OLD.manager_user_id = _current_user_id)
    ) THEN
      RAISE EXCEPTION 'Only admins can change manager_user_id' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN
    RAISE EXCEPTION 'Only admins can change role_id' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. Effective-dated membership history (O2: not a hard delete).
-- ════════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.manager_assignment_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_user_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  manager_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  effective_from  timestamptz NOT NULL DEFAULT now(),
  effective_to    timestamptz,
  changed_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mah_report ON public.manager_assignment_history(report_user_id);
CREATE INDEX IF NOT EXISTS idx_mah_manager ON public.manager_assignment_history(manager_user_id);
-- At most one open (current) period per report.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mah_open_period
  ON public.manager_assignment_history(report_user_id)
  WHERE effective_to IS NULL;

ALTER TABLE public.manager_assignment_history ENABLE ROW LEVEL SECURITY;

-- Read: admins, plus anyone who is/was the manager or the report. No write policy —
-- only the SECURITY DEFINER trigger below writes it (bypassing RLS).
DROP POLICY IF EXISTS "manager_assignment_history_select" ON public.manager_assignment_history;
CREATE POLICY "manager_assignment_history_select"
  ON public.manager_assignment_history
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'admin'
    OR manager_user_id = auth.uid()
    OR report_user_id = auth.uid()
  );

-- Trigger: on any manager change (admin or self-serve), close the open period and
-- open a new one. now() is the transaction timestamp — stable within the tx.
CREATE OR REPLACE FUNCTION public.trigger_manager_assignment_history()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.manager_user_id IS DISTINCT FROM NEW.manager_user_id THEN
    UPDATE public.manager_assignment_history
       SET effective_to = now()
     WHERE report_user_id = NEW.id AND effective_to IS NULL;

    IF NEW.manager_user_id IS NOT NULL THEN
      INSERT INTO public.manager_assignment_history (report_user_id, manager_user_id, changed_by)
      VALUES (NEW.id, NEW.manager_user_id, auth.uid());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_manager_history_trigger ON public.users;
CREATE TRIGGER user_manager_history_trigger
  AFTER UPDATE OF manager_user_id
  ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_manager_assignment_history();

-- ════════════════════════════════════════════════════════════════════════════════
-- 4. Fix the reparent recompute fan-out gap. recompute_visibility_for_user only
--    covers the moved user's OWN deals; a manager sees a subordinate's deal via the
--    chain, so moving X must recompute X AND every recursive report's deals.
-- ════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.recompute_visibility_for_user_subtree(_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid;
BEGIN
  FOR _uid IN
    WITH RECURSIVE subtree AS (
      SELECT _user_id AS id
      UNION
      SELECT u.id FROM public.users u JOIN subtree s ON u.manager_user_id = s.id
    )
    SELECT id FROM subtree
  LOOP
    PERFORM public.recompute_visibility_for_user(_uid);
  END LOOP;
END;
$$;

-- Repoint the existing reparent trigger's function at the subtree recompute.
CREATE OR REPLACE FUNCTION public.trigger_recompute_user_visibility()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.manager_user_id IS DISTINCT FROM NEW.manager_user_id THEN
    PERFORM public.recompute_visibility_for_user_subtree(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════
-- 5. Self-serve RPCs — SECURITY DEFINER so a manager (who has no RLS UPDATE on
--    another user's row) can perform the scoped change. Both re-assert the
--    capability, audit the change, and return the losing manager for notification.
-- ════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.assign_direct_report(_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor        uuid := auth.uid();
  _prev_manager uuid;
  _report_name  text;
BEGIN
  IF NOT public.can_manage_direct_report(_actor, _report_id) THEN
    RAISE EXCEPTION 'not authorised to manage this direct report'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT manager_user_id, full_name INTO _prev_manager, _report_name
    FROM public.users WHERE id = _report_id FOR UPDATE;

  IF _prev_manager = _actor THEN
    RAISE EXCEPTION 'already your direct report' USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE public.users SET manager_user_id = _actor WHERE id = _report_id;

  INSERT INTO public.audit_log (operation, table_name, row_id, actor_user_id, actor_source, old_data, new_data)
  VALUES ('UPDATE', 'users', _report_id, _actor, 'user',
    jsonb_build_object('manager_user_id', _prev_manager),
    jsonb_build_object('manager_user_id', _actor, 'direct_report_assignment', true));

  RETURN jsonb_build_object(
    'report_id',         _report_id,
    'report_name',       _report_name,
    'losing_manager_id', _prev_manager
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assign_direct_report(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.assign_direct_report(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_direct_report(_report_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _actor        uuid := auth.uid();
  _prev_manager uuid;
  _report_name  text;
BEGIN
  SELECT manager_user_id, full_name INTO _prev_manager, _report_name
    FROM public.users WHERE id = _report_id FOR UPDATE;

  -- Only the current manager may release their own report.
  IF _prev_manager IS DISTINCT FROM _actor THEN
    RAISE EXCEPTION 'not your direct report' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.users SET manager_user_id = NULL WHERE id = _report_id;

  INSERT INTO public.audit_log (operation, table_name, row_id, actor_user_id, actor_source, old_data, new_data)
  VALUES ('UPDATE', 'users', _report_id, _actor, 'user',
    jsonb_build_object('manager_user_id', _actor),
    jsonb_build_object('manager_user_id', NULL, 'direct_report_release', true));

  RETURN jsonb_build_object('report_id', _report_id, 'report_name', _report_name);
END;
$$;

REVOKE ALL ON FUNCTION public.remove_direct_report(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.remove_direct_report(uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════════
-- 6. Default routing for the reassignment notification (in_app + email, org-wide).
-- ════════════════════════════════════════════════════════════════════════════════
INSERT INTO public.notification_routing (event_type, channel, enabled)
SELECT 'direct_report_reassigned'::public.notification_event_type, ch, true
  FROM (VALUES ('in_app'::public.notification_channel), ('email'::public.notification_channel)) AS c(ch)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.notification_routing r
    WHERE r.event_type = 'direct_report_reassigned'
      AND r.channel = c.ch
      AND r.entity_id IS NULL
 );
