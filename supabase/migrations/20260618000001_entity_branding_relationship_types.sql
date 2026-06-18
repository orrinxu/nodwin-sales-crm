-- supabase/migrations/20260618000001_entity_branding_relationship_types.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-512 / ORR-502-a: Entity branding and relationship types schema.
--
-- 1. Add branding columns to public.entities (display_name, logo_url, email_footer).
-- 2. Create public.relationship_types lookup table.
-- 3. Migrate account_relationships.kind from enum to text FK referencing relationship_types(code).
-- 4. RLS, audit triggers.
--
-- Idempotent: safe to re-run.

-- ============================================================================
-- 1. ENTITY BRANDING COLUMNS
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'entities'
      AND column_name  = 'display_name'
  ) THEN
    ALTER TABLE public.entities ADD COLUMN display_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'entities'
      AND column_name  = 'logo_url'
  ) THEN
    ALTER TABLE public.entities ADD COLUMN logo_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'entities'
      AND column_name  = 'email_footer'
  ) THEN
    ALTER TABLE public.entities ADD COLUMN email_footer text;
  END IF;
END;
$$;

-- ============================================================================
-- 2. RELATIONSHIP TYPES LOOKUP TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.relationship_types (
  code        text PRIMARY KEY,
  label       text        NOT NULL,
  description text,
  active      boolean     NOT NULL DEFAULT true,
  sort_order  int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relationship_types_active
  ON public.relationship_types(active)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_relationship_types_sort_order
  ON public.relationship_types(sort_order);

-- Drop the generic audit trigger if it was attached in a prior run
-- (the generic trigger expects uuid "id", but this table uses text "code" PK).
DROP TRIGGER IF EXISTS audit_trigger ON public.relationship_types;

-- Seed the 5 existing enum values.
INSERT INTO public.relationship_types (code, label, description, sort_order)
VALUES
  ('subsidiary_of',    'Subsidiary Of',    'This account is a subsidiary of the target account',     1),
  ('parent_of',        'Parent Of',        'This account is the parent of the target account',       2),
  ('sister_company',   'Sister Company',   'These accounts are sister companies under a parent',     3),
  ('partner_with',     'Partner With',     'This account partners with the target account',          4),
  ('procurement_via',  'Procurement Via',  'Procurement flows through the target account',           5)
ON CONFLICT (code) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order  = EXCLUDED.sort_order;

-- ============================================================================
-- 3. MIGRATE account_relationships.kind FROM ENUM TO TEXT FK
-- ============================================================================

-- 3a. Drop the UNIQUE constraint that includes the kind column (auto-generated name).
DO $$
DECLARE
  _conname text;
BEGIN
  SELECT con.conname INTO _conname
  FROM   pg_constraint con
  JOIN   pg_class     rel ON rel.oid = con.conrelid
  WHERE  rel.relname      = 'account_relationships'
    AND  rel.relnamespace = 'public'::regnamespace
    AND  con.contype      = 'u';

  IF _conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.account_relationships DROP CONSTRAINT IF EXISTS %I', _conname);
  END IF;
END;
$$;

-- 3b. Alter kind column from enum to text.
--     USING kind::text preserves all existing data.
ALTER TABLE public.account_relationships
  ALTER COLUMN kind SET DATA TYPE text USING kind::text;

-- 3c. Add FK constraint to relationship_types.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conrelid  = 'public.account_relationships'::regclass
      AND  conname   = 'fk_account_relationships_kind'
  ) THEN
    ALTER TABLE public.account_relationships
      ADD CONSTRAINT fk_account_relationships_kind
      FOREIGN KEY (kind) REFERENCES public.relationship_types(code);
  END IF;
END;
$$;

-- 3d. Restore the UNIQUE constraint on (from_account_id, to_account_id, kind).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE  conrelid  = 'public.account_relationships'::regclass
      AND  contype   = 'u'
  ) THEN
    ALTER TABLE public.account_relationships
      ADD CONSTRAINT account_relationships_from_to_kind_key
      UNIQUE (from_account_id, to_account_id, kind);
  END IF;
END;
$$;

-- ============================================================================
-- 4. TRIGGER: set updated_at on relationship_types
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_relationship_type_timestamps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS relationship_type_timestamps_trigger ON public.relationship_types;
CREATE TRIGGER relationship_type_timestamps_trigger
  BEFORE UPDATE ON public.relationship_types
  FOR EACH ROW
  EXECUTE FUNCTION public.set_relationship_type_timestamps();

-- ============================================================================
-- 5. AUDIT LOG — custom trigger (table uses text PK; generic audit expects uuid)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.audit_relationship_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_user_id     uuid;
  _actor_source      text;
  _code              text;
  _old_data          jsonb;
  _new_data          jsonb;
  _changed_fields    jsonb;
BEGIN
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

  _actor_source := CASE WHEN _actor_user_id IS NOT NULL THEN 'user' ELSE 'system' END;

  IF TG_OP = 'DELETE' THEN
    _code := OLD.code;
    _old_data := to_jsonb(OLD);
    _new_data := NULL;
    _changed_fields := _old_data;
  ELSIF TG_OP = 'INSERT' THEN
    _code := NEW.code;
    _old_data := NULL;
    _new_data := to_jsonb(NEW);
    _changed_fields := _new_data;
  ELSE -- UPDATE
    _code := NEW.code;
    _old_data := to_jsonb(OLD);
    _new_data := to_jsonb(NEW);
    _changed_fields := audit.jsonb_diff(_old_data, _new_data);
  END IF;

  INSERT INTO public.audit_log (
    table_name, row_id, operation, changed_fields, old_data, new_data,
    actor_user_id, actor_source, actor_ip, actor_user_agent, occurred_at
  ) VALUES (
    TG_TABLE_NAME,
    md5(_code)::uuid, -- deterministic UUID from text PK
    TG_OP,
    _changed_fields,
    _old_data,
    _new_data,
    _actor_user_id,
    _actor_source,
    audit.get_request_header('x-forwarded-for'),
    audit.get_request_header('user-agent'),
    now()
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_relationship_type_trigger ON public.relationship_types;
CREATE TRIGGER audit_relationship_type_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.relationship_types
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_relationship_type();

-- ============================================================================
-- 6. ROW-LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.relationship_types ENABLE ROW LEVEL SECURITY;

-- SELECT: all authenticated users can read.
DROP POLICY IF EXISTS "relationship_types_select_authenticated" ON public.relationship_types;
CREATE POLICY "relationship_types_select_authenticated"
  ON public.relationship_types
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: admin only.
DROP POLICY IF EXISTS "relationship_types_insert_admin" ON public.relationship_types;
CREATE POLICY "relationship_types_insert_admin"
  ON public.relationship_types
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- UPDATE: admin only.
DROP POLICY IF EXISTS "relationship_types_update_admin" ON public.relationship_types;
CREATE POLICY "relationship_types_update_admin"
  ON public.relationship_types
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- DELETE: admin only.
DROP POLICY IF EXISTS "relationship_types_delete_admin" ON public.relationship_types;
CREATE POLICY "relationship_types_delete_admin"
  ON public.relationship_types
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
