-- supabase/migrations/20260506000004_approval_workflows.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Creates the approval workflow subsystem:
--   approval_workflows  — workflow templates/definitions
--   approval_instances  — triggered workflow runs against an entity
--   approval_steps      — sequential steps within an instance
--   approval_decisions  — decisions recorded on each step
--
-- Includes RLS policies and audit log triggers.
-- (ORR-309 / T-028)
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- Enums
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN   pg_namespace n ON n.oid = t.typnamespace
    WHERE  n.nspname = 'public' AND t.typname = 'approval_status'
  ) THEN
    CREATE TYPE public.approval_status AS ENUM (
      'pending',
      'approved',
      'rejected',
      'cancelled'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN   pg_namespace n ON n.oid = t.typnamespace
    WHERE  n.nspname = 'public' AND t.typname = 'approval_step_status'
  ) THEN
    CREATE TYPE public.approval_step_status AS ENUM (
      'pending',
      'approved',
      'rejected',
      'skipped'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN   pg_namespace n ON n.oid = t.typnamespace
    WHERE  n.nspname = 'public' AND t.typname = 'approval_decision_type'
  ) THEN
    CREATE TYPE public.approval_decision_type AS ENUM (
      'approved',
      'rejected',
      'skipped'
    );
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. approval_workflows
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.approval_workflows (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text,
  entity_type text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid,
  updated_by  uuid
);

CREATE INDEX IF NOT EXISTS idx_approval_workflows_entity_type
  ON public.approval_workflows(entity_type);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. approval_instances
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.approval_instances (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id         uuid NOT NULL REFERENCES public.approval_workflows(id) ON DELETE RESTRICT,
  entity_type         text NOT NULL,
  entity_id           uuid NOT NULL,
  status              public.approval_status NOT NULL DEFAULT 'pending',
  triggered_by_user_id uuid REFERENCES public.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid,
  updated_by          uuid
);

CREATE INDEX IF NOT EXISTS idx_approval_instances_workflow_id
  ON public.approval_instances(workflow_id);

CREATE INDEX IF NOT EXISTS idx_approval_instances_entity
  ON public.approval_instances(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_approval_instances_triggered_by
  ON public.approval_instances(triggered_by_user_id)
  WHERE triggered_by_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_approval_instances_status
  ON public.approval_instances(status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. approval_steps
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.approval_steps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id     uuid NOT NULL REFERENCES public.approval_instances(id) ON DELETE CASCADE,
  step_order      int  NOT NULL,
  approver_role   public.user_role,
  approver_user_id uuid REFERENCES public.users(id),
  status          public.approval_step_status NOT NULL DEFAULT 'pending',
  due_by          timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_approval_steps_approver CHECK (
    approver_role IS NOT NULL OR approver_user_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_approval_steps_instance_id
  ON public.approval_steps(instance_id);

CREATE INDEX IF NOT EXISTS idx_approval_steps_approver_user_id
  ON public.approval_steps(approver_user_id)
  WHERE approver_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_approval_steps_status
  ON public.approval_steps(status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. approval_decisions
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.approval_decisions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id           uuid NOT NULL REFERENCES public.approval_steps(id) ON DELETE CASCADE,
  decided_by_user_id uuid NOT NULL REFERENCES public.users(id),
  decision          public.approval_decision_type NOT NULL,
  comment           text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_approval_decisions_step_id
  ON public.approval_decisions(step_id);

CREATE INDEX IF NOT EXISTS idx_approval_decisions_decided_by
  ON public.approval_decisions(decided_by_user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Validation trigger: ensure approval_steps.step_order is unique per instance
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.check_approval_step_order_unique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.approval_steps
    WHERE instance_id = NEW.instance_id
      AND step_order = NEW.step_order
      AND id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'step_order % already exists for instance %', NEW.step_order, NEW.instance_id
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approval_step_order_unique_trigger ON public.approval_steps;
CREATE TRIGGER approval_step_order_unique_trigger
  BEFORE INSERT OR UPDATE ON public.approval_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.check_approval_step_order_unique();

-- ═══════════════════════════════════════════════════════════════════════════════
-- Audit triggers: set created_by / updated_by
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_approval_workflow_audit_fields()
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

DROP TRIGGER IF EXISTS approval_workflow_audit_fields_trigger ON public.approval_workflows;
CREATE TRIGGER approval_workflow_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.approval_workflows
  FOR EACH ROW
  EXECUTE FUNCTION public.set_approval_workflow_audit_fields();

CREATE OR REPLACE FUNCTION public.set_approval_instance_audit_fields()
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

DROP TRIGGER IF EXISTS approval_instance_audit_fields_trigger ON public.approval_instances;
CREATE TRIGGER approval_instance_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.approval_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.set_approval_instance_audit_fields();

CREATE OR REPLACE FUNCTION public.set_approval_step_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approval_step_audit_fields_trigger ON public.approval_steps;
CREATE TRIGGER approval_step_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.approval_steps
  FOR EACH ROW
  EXECUTE FUNCTION public.set_approval_step_audit_fields();

-- ═══════════════════════════════════════════════════════════════════════════════
-- Audit log
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT audit.attach_trigger('public.approval_workflows');
SELECT audit.attach_trigger('public.approval_instances');
SELECT audit.attach_trigger('public.approval_steps');
SELECT audit.attach_trigger('public.approval_decisions');

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.approval_workflows  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_instances  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_steps      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_decisions  ENABLE ROW LEVEL SECURITY;

-- ── approval_workflows ────────────────────────────────────────────────────────

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

-- ── approval_instances ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "approval_instances_select_scoped" ON public.approval_instances;
CREATE POLICY "approval_instances_select_scoped"
  ON public.approval_instances
  FOR SELECT
  TO authenticated
  USING (
    triggered_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.approval_steps
      WHERE instance_id = public.approval_instances.id
        AND approver_user_id = auth.uid()
    )
    OR public.current_user_role() = 'admin'
  );

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

DROP POLICY IF EXISTS "approval_steps_select_scoped" ON public.approval_steps;
CREATE POLICY "approval_steps_select_scoped"
  ON public.approval_steps
  FOR SELECT
  TO authenticated
  USING (
    approver_user_id = auth.uid()
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

DROP POLICY IF EXISTS "approval_decisions_select_scoped" ON public.approval_decisions;
CREATE POLICY "approval_decisions_select_scoped"
  ON public.approval_decisions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.approval_steps
      WHERE id = public.approval_decisions.step_id
        AND approver_user_id = auth.uid()
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
        AND approver_user_id = auth.uid()
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
