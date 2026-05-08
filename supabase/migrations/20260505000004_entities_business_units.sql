-- supabase/migrations/20260505000004_entities_business_units.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Creates the entities and business_units tables per data model §4.1, §4.2.
-- Adds FK constraints on public.users (primary_entity_id, primary_business_unit_id)
-- that were deferred from T-020.
-- (ORR-306 / T-019)
--
-- Idempotent: safe to re-run.

-- ── Enum: business_unit_kind ─────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_type t
    JOIN   pg_namespace n ON n.oid = t.typnamespace
    WHERE  n.nspname = 'public'
    AND    t.typname  = 'business_unit_kind'
  ) THEN
    CREATE TYPE public.business_unit_kind AS ENUM (
      'sales',
      'revenue_recognition',
      'ops',
      'shared'
    );
  END IF;
END;
$$;

-- ── Table: public.entities ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.entities (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text        NOT NULL,
  legal_name              text,
  country                 text,
  base_currency           text        NOT NULL DEFAULT 'USD',
  fiscal_year_start_month int         NOT NULL DEFAULT 1
                           CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  active                  boolean     NOT NULL DEFAULT true,
  custom_data             jsonb       NOT NULL DEFAULT '{}',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid,
  updated_by              uuid
);

CREATE INDEX IF NOT EXISTS idx_entities_name
  ON public.entities(name);

CREATE INDEX IF NOT EXISTS idx_entities_active
  ON public.entities(active)
  WHERE active = true;

-- ── Table: public.business_units ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.business_units (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text                       NOT NULL,
  entity_id        uuid REFERENCES public.entities(id),
  kind             public.business_unit_kind  NOT NULL DEFAULT 'sales',
  parent_id        uuid REFERENCES public.business_units(id),
  manager_user_id  uuid REFERENCES public.users(id),
  active           boolean                    NOT NULL DEFAULT true,
  custom_data      jsonb                      NOT NULL DEFAULT '{}',
  created_at       timestamptz                NOT NULL DEFAULT now(),
  updated_at       timestamptz                NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_by       uuid
);

CREATE INDEX IF NOT EXISTS idx_business_units_name
  ON public.business_units(name);

CREATE INDEX IF NOT EXISTS idx_business_units_entity_id
  ON public.business_units(entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_business_units_parent_id
  ON public.business_units(parent_id)
  WHERE parent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_business_units_manager_user_id
  ON public.business_units(manager_user_id)
  WHERE manager_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_business_units_active
  ON public.business_units(active)
  WHERE active = true;

-- ── FK constraints on public.users (deferred from T-020) ────────────────────
-- DEFERRABLE INITIALLY DEFERRED so that existing test fixtures with
-- placeholder entity/bu IDs don't break within rolled-back transactions.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conrelid = 'public.users'::regclass
    AND    conname  = 'fk_users_primary_entity_id'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT fk_users_primary_entity_id
      FOREIGN KEY (primary_entity_id) REFERENCES public.entities(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conrelid = 'public.users'::regclass
    AND    conname  = 'fk_users_primary_business_unit_id'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT fk_users_primary_business_unit_id
      FOREIGN KEY (primary_business_unit_id) REFERENCES public.business_units(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END;
$$;

-- ── Trigger: set created_by / updated_by on entities ─────────────────────────
CREATE OR REPLACE FUNCTION public.set_entity_audit_fields()
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

DROP TRIGGER IF EXISTS entity_audit_fields_trigger ON public.entities;
CREATE TRIGGER entity_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.entities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_entity_audit_fields();

-- ── Trigger: set created_by / updated_by on business_units ───────────────────
CREATE OR REPLACE FUNCTION public.set_business_unit_audit_fields()
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

DROP TRIGGER IF EXISTS business_unit_audit_fields_trigger ON public.business_units;
CREATE TRIGGER business_unit_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.business_units
  FOR EACH ROW
  EXECUTE FUNCTION public.set_business_unit_audit_fields();

-- ── Audit log ───────────────────────────────────────────────────────────────
SELECT audit.attach_trigger('public.entities');
SELECT audit.attach_trigger('public.business_units');

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_units ENABLE ROW LEVEL SECURITY;

-- Entities SELECT: all authenticated users can read.
DROP POLICY IF EXISTS "entities_select_authenticated" ON public.entities;
CREATE POLICY "entities_select_authenticated"
  ON public.entities
  FOR SELECT
  TO authenticated
  USING (true);

-- Entities INSERT: admin only.
DROP POLICY IF EXISTS "entities_insert_admin" ON public.entities;
CREATE POLICY "entities_insert_admin"
  ON public.entities
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- Entities UPDATE: admin only.
DROP POLICY IF EXISTS "entities_update_admin" ON public.entities;
CREATE POLICY "entities_update_admin"
  ON public.entities
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- Entities DELETE: admin only.
DROP POLICY IF EXISTS "entities_delete_admin" ON public.entities;
CREATE POLICY "entities_delete_admin"
  ON public.entities
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- Business Units SELECT: all authenticated users can read.
DROP POLICY IF EXISTS "business_units_select_authenticated" ON public.business_units;
CREATE POLICY "business_units_select_authenticated"
  ON public.business_units
  FOR SELECT
  TO authenticated
  USING (true);

-- Business Units INSERT: admin only.
DROP POLICY IF EXISTS "business_units_insert_admin" ON public.business_units;
CREATE POLICY "business_units_insert_admin"
  ON public.business_units
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- Business Units UPDATE: admin only.
DROP POLICY IF EXISTS "business_units_update_admin" ON public.business_units;
CREATE POLICY "business_units_update_admin"
  ON public.business_units
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- Business Units DELETE: admin only.
DROP POLICY IF EXISTS "business_units_delete_admin" ON public.business_units;
CREATE POLICY "business_units_delete_admin"
  ON public.business_units
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
