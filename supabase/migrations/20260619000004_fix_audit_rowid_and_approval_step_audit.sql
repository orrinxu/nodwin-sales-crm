-- supabase/migrations/20260619000004_fix_audit_rowid_and_approval_step_audit.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Gap-closure fixes for two pre-existing production bugs surfaced by the
-- pgTAP suite (ORR-600).
--
-- 1. audit.log_change() hardcoded `_row_id := NEW.id` / `OLD.id`. Any audited
--    table whose primary key is NOT a column named `id` (e.g. public.currencies,
--    PK = `code`) raised `record "new" has no field "id"` on EVERY write,
--    blocking all inserts/updates/deletes on those tables. This makes the audit
--    of such tables impossible in production.
--    Fix: extract the id defensively from the row's jsonb representation
--    (`(to_jsonb(NEW) ->> 'id')::uuid`), yielding NULL when there is no `id`
--    column, and make audit_log.row_id nullable so the NULL is accepted.
--
-- 2. set_approval_step_audit_fields() sets NEW.updated_by, but public.approval_steps
--    never had an `updated_by` column, so every INSERT/UPDATE on approval_steps
--    raised `record "new" has no field "updated_by"`. Its sibling tables
--    (approval_workflows, approval_instances) both carry created_by/updated_by,
--    so the audit columns clearly belong on approval_steps too.
--    Fix: add created_by / updated_by to approval_steps (matching the siblings)
--    and populate created_by in the trigger for consistency.
--
-- Idempotent: safe to re-run.

-- ── 1. audit_log.row_id → nullable ───────────────────────────────────────────
ALTER TABLE public.audit_log
  ALTER COLUMN row_id DROP NOT NULL;

-- ── 1. audit.log_change(): safe id extraction ────────────────────────────────
CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_user_id  uuid;
  _actor_source   text;
  _old_data       jsonb;
  _new_data       jsonb;
  _changed_fields jsonb;
  _row_id         uuid;
BEGIN
  -- Actor: auth.uid() when available (PostgREST / Supabase), else JWT claims
  BEGIN
    _actor_user_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    _actor_user_id := NULL;
  END;

  IF _actor_user_id IS NULL THEN
    BEGIN
      _actor_user_id := (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid;
    EXCEPTION WHEN OTHERS THEN
      _actor_user_id := NULL;
    END;
  END IF;

  -- Derive actor_source from execution context (NOT from client-controlled headers).
  -- If we have an authenticated user → 'user'; otherwise → 'system'.
  IF _actor_user_id IS NOT NULL THEN
    _actor_source := 'user';
  ELSE
    _actor_source := 'system';
  END IF;

  IF TG_OP = 'DELETE' THEN
    _old_data := to_jsonb(OLD);
    _new_data := NULL;
    _changed_fields := _old_data;
    -- Extract id safely: NULL when the audited table has no uuid `id` column
    -- (e.g. currencies, PK = code) or when the value is not a valid uuid.
    BEGIN
      _row_id := (_old_data ->> 'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      _row_id := NULL;
    END;

    INSERT INTO public.audit_log (
      table_name, row_id, operation, changed_fields, old_data, new_data,
      actor_user_id, actor_source, actor_ip, actor_user_agent, occurred_at
    ) VALUES (
      TG_TABLE_NAME, _row_id, TG_OP, _changed_fields, _old_data, _new_data,
      _actor_user_id,
      _actor_source,
      audit.get_request_header('x-forwarded-for'),
      audit.get_request_header('user-agent'),
      now()
    );
    RETURN OLD;

  ELSIF TG_OP = 'INSERT' THEN
    _old_data := NULL;
    _new_data := to_jsonb(NEW);
    _changed_fields := _new_data;
    BEGIN
      _row_id := (_new_data ->> 'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      _row_id := NULL;
    END;

    INSERT INTO public.audit_log (
      table_name, row_id, operation, changed_fields, old_data, new_data,
      actor_user_id, actor_source, actor_ip, actor_user_agent, occurred_at
    ) VALUES (
      TG_TABLE_NAME, _row_id, TG_OP, _changed_fields, _old_data, _new_data,
      _actor_user_id,
      _actor_source,
      audit.get_request_header('x-forwarded-for'),
      audit.get_request_header('user-agent'),
      now()
    );
    RETURN NEW;

  ELSE -- UPDATE
    _old_data := to_jsonb(OLD);
    _new_data := to_jsonb(NEW);
    _changed_fields := audit.jsonb_diff(_old_data, _new_data);
    BEGIN
      _row_id := (_new_data ->> 'id')::uuid;
    EXCEPTION WHEN OTHERS THEN
      _row_id := NULL;
    END;

    INSERT INTO public.audit_log (
      table_name, row_id, operation, changed_fields, old_data, new_data,
      actor_user_id, actor_source, actor_ip, actor_user_agent, occurred_at
    ) VALUES (
      TG_TABLE_NAME, _row_id, TG_OP, _changed_fields, _old_data, _new_data,
      _actor_user_id,
      _actor_source,
      audit.get_request_header('x-forwarded-for'),
      audit.get_request_header('user-agent'),
      now()
    );
    RETURN NEW;
  END IF;
END;
$$;

-- ── 2. approval_steps: add audit columns to match siblings ───────────────────
ALTER TABLE public.approval_steps
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

-- ── 2. set_approval_step_audit_fields(): populate created_by too ─────────────
CREATE OR REPLACE FUNCTION public.set_approval_step_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

-- ── 3. Break infinite RLS recursion between approval_instances / approval_steps
--
-- approval_instances_select_scoped had an EXISTS subquery over approval_steps,
-- and approval_steps_select_scoped had an EXISTS subquery over
-- approval_instances. Because each subquery is itself subject to the OTHER
-- table's RLS policy, selecting from either table recursed infinitely
-- ("infinite recursion detected in policy for relation ...") — every read of
-- approval_instances / approval_steps for a non-admin failed in production.
--
-- Fix: move the cross-table lookups into SECURITY DEFINER helper functions,
-- which run with the definer's privileges and bypass RLS on the inner table,
-- so the two policies no longer trigger each other.

CREATE OR REPLACE FUNCTION public.user_is_step_approver_for_instance(
  _instance_id uuid,
  _user_id     uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.approval_steps
    WHERE instance_id = _instance_id
      AND approver_user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.user_triggered_instance_of_step(
  _instance_id uuid,
  _user_id     uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.approval_instances
    WHERE id = _instance_id
      AND triggered_by_user_id = _user_id
  );
$$;

DROP POLICY IF EXISTS "approval_instances_select_scoped" ON public.approval_instances;
CREATE POLICY "approval_instances_select_scoped"
  ON public.approval_instances
  FOR SELECT
  TO authenticated
  USING (
    triggered_by_user_id = auth.uid()
    OR public.user_is_step_approver_for_instance(public.approval_instances.id, auth.uid())
    OR public.current_user_role() = 'admin'
  );

DROP POLICY IF EXISTS "approval_steps_select_scoped" ON public.approval_steps;
CREATE POLICY "approval_steps_select_scoped"
  ON public.approval_steps
  FOR SELECT
  TO authenticated
  USING (
    approver_user_id = auth.uid()
    OR public.user_triggered_instance_of_step(public.approval_steps.instance_id, auth.uid())
    OR public.current_user_role() = 'admin'
  );
