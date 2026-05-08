-- supabase/migrations/20260508000000_custom_fields.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-310 / T-029: Custom field definitions and validation.
--
-- Creates:
--   • Enums: field_entity_type, field_data_type
--   • Table: field_definitions (per data model §4.10)
--   • Function: validate_custom_data(entity_type, custom_data jsonb)
--   • Triggers on opportunities, accounts, contacts (if present)
--   • RLS: all authenticated read; admin-only write
--   • Audit log trigger
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Enums
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'field_entity_type'
  ) THEN
    CREATE TYPE public.field_entity_type AS ENUM (
      'account',
      'contact',
      'opportunity',
      'activity'
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'field_data_type'
  ) THEN
    CREATE TYPE public.field_data_type AS ENUM (
      'text',
      'rich_text',
      'number',
      'currency',
      'date',
      'datetime',
      'single_select',
      'multi_select',
      'user_ref',
      'account_ref',
      'boolean',
      'url',
      'formula'
    );
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Table: field_definitions
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.field_definitions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       public.field_entity_type NOT NULL,
  key               text NOT NULL,
  label             text NOT NULL,
  data_type         public.field_data_type NOT NULL,
  options           jsonb,
  required          boolean NOT NULL DEFAULT false,
  default_value     jsonb,
  visible_to_roles  text[],
  editable_by_roles text[],
  visible_at_stages text[],
  display_order     int NOT NULL DEFAULT 0,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_by        uuid,
  UNIQUE (entity_type, key)
);

COMMENT ON TABLE public.field_definitions IS
  'Custom field schema definitions per entity type (SOW §4.10).';

COMMENT ON COLUMN public.field_definitions.entity_type IS
  'Which CRM entity this field belongs to.';
COMMENT ON COLUMN public.field_definitions.key IS
  'JSONB key in custom_data. Snake_case, e.g. second_payment_terms.';
COMMENT ON COLUMN public.field_definitions.data_type IS
  'Type of the value — used by the validation trigger.';
COMMENT ON COLUMN public.field_definitions.options IS
  'For single_select and multi_select: array of valid option values.';
COMMENT ON COLUMN public.field_definitions.required IS
  'If true, the key must be present in custom_data.';
COMMENT ON COLUMN public.field_definitions.active IS
  'Soft-delete flag; inactive definitions are ignored by the validator but data is preserved.';

CREATE INDEX IF NOT EXISTS idx_field_definitions_entity_type_key
  ON public.field_definitions(entity_type, key);

CREATE INDEX IF NOT EXISTS idx_field_definitions_entity_type_active
  ON public.field_definitions(entity_type, active);

CREATE INDEX IF NOT EXISTS idx_field_definitions_display_order
  ON public.field_definitions(display_order);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Validation function
-- ═══════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.validate_custom_data(text, jsonb);

CREATE OR REPLACE FUNCTION public.validate_custom_data(
  _entity_type text,
  custom_data jsonb
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _key        text;
  _value      jsonb;
  _field      public.field_definitions%ROWTYPE;
  _val_text   text;
  _val_num    numeric;
  _opt_val    jsonb;
BEGIN
  -- ── Allow NULL or empty custom_data (only required fields enforced later) ──
  IF custom_data IS NULL OR custom_data = '{}'::jsonb THEN
    PERFORM 1 FROM public.field_definitions
      WHERE entity_type = _entity_type::public.field_entity_type
        AND active = true
        AND required = true;
    IF FOUND THEN
      RETURN false;
    END IF;
    RETURN true;
  END IF;

  -- ── Validate each key present in custom_data ────────────────────────────────
  FOR _key IN SELECT jsonb_object_keys(custom_data)
  LOOP
    _value := custom_data -> _key;

    SELECT * INTO _field
    FROM public.field_definitions
    WHERE entity_type = _entity_type::public.field_entity_type
      AND key = _key
      AND active = true;

    -- Key without a matching active definition is allowed (preserved from a
    -- soft-deleted field);
    CONTINUE WHEN NOT FOUND;

    -- Type validation
    CASE _field.data_type
      WHEN 'text', 'rich_text', 'url' THEN
        IF jsonb_typeof(_value) != 'string' THEN
          RETURN false;
        END IF;

      WHEN 'number', 'currency' THEN
        IF jsonb_typeof(_value) != 'number' THEN
          RETURN false;
        END IF;

      WHEN 'date' THEN
        IF jsonb_typeof(_value) != 'string'
           OR _value #>> '{}' !~ '^\d{4}-\d{2}-\d{2}$'
        THEN
          RETURN false;
        END IF;

      WHEN 'datetime' THEN
        IF jsonb_typeof(_value) != 'string' THEN
          RETURN false;
        END IF;

      WHEN 'boolean' THEN
        IF jsonb_typeof(_value) != 'boolean' THEN
          RETURN false;
        END IF;

      WHEN 'single_select' THEN
        IF jsonb_typeof(_value) != 'string' THEN
          RETURN false;
        END IF;
        IF _field.options IS NOT NULL THEN
          _val_text := _value #>> '{}';
          IF NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(_field.options) AS opt
            WHERE opt = _val_text
          ) THEN
            RETURN false;
          END IF;
        END IF;

      WHEN 'multi_select' THEN
        IF jsonb_typeof(_value) != 'array' THEN
          RETURN false;
        END IF;
        IF _field.options IS NOT NULL THEN
          FOR _opt_val IN SELECT jsonb_array_elements(_value)
          LOOP
            _val_text := _opt_val #>> '{}';
            IF _val_text IS NULL THEN
              RETURN false;
            END IF;
            IF NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(_field.options) AS opt
              WHERE opt = _val_text
            ) THEN
              RETURN false;
            END IF;
          END LOOP;
        END IF;

      WHEN 'user_ref', 'account_ref' THEN
        IF jsonb_typeof(_value) != 'string' THEN
          RETURN false;
        END IF;

      WHEN 'formula' THEN
        -- Formula results accept any type — computed at read time
        NULL;

      ELSE
        NULL;
    END CASE;
  END LOOP;

  -- ── Check required fields ───────────────────────────────────────────────────
  FOR _field IN
    SELECT * FROM public.field_definitions
    WHERE entity_type = _entity_type::public.field_entity_type
      AND active = true
      AND required = true
  LOOP
    IF NOT custom_data ? _field.key THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Validation triggers on entity tables
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── opportunities ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_opportunity_custom_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.validate_custom_data('opportunity'::text, NEW.custom_data) THEN
    RAISE EXCEPTION 'custom_data validation failed for opportunity %', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opportunity_custom_data_validate_trigger ON public.opportunities;
CREATE TRIGGER opportunity_custom_data_validate_trigger
  BEFORE INSERT OR UPDATE ON public.opportunities
  FOR EACH ROW
  WHEN (NEW.custom_data IS NOT NULL AND NEW.custom_data <> '{}'::jsonb)
  EXECUTE FUNCTION public.validate_opportunity_custom_data();

-- ── accounts ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_account_custom_data()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.validate_custom_data('account'::text, NEW.custom_data) THEN
    RAISE EXCEPTION 'custom_data validation failed for account %', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_custom_data_validate_trigger ON public.accounts;
CREATE TRIGGER account_custom_data_validate_trigger
  BEFORE INSERT OR UPDATE ON public.accounts
  FOR EACH ROW
  WHEN (NEW.custom_data IS NOT NULL AND NEW.custom_data <> '{}'::jsonb)
  EXECUTE FUNCTION public.validate_account_custom_data();

-- ── contacts (conditional — the table may not exist yet) ─────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'contacts' AND relnamespace = 'public'::regnamespace
  ) THEN
    EXECUTE $ex$
      CREATE OR REPLACE FUNCTION public.validate_contact_custom_data()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public
      AS $fn$
      BEGIN
        IF NOT public.validate_custom_data('contact'::text, NEW.custom_data) THEN
          RAISE EXCEPTION 'custom_data validation failed for contact %', NEW.id
            USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END;
      $fn$;

      DROP TRIGGER IF EXISTS contact_custom_data_validate_trigger ON public.contacts;
      CREATE TRIGGER contact_custom_data_validate_trigger
        BEFORE INSERT OR UPDATE ON public.contacts
        FOR EACH ROW
        WHEN (NEW.custom_data IS NOT NULL AND NEW.custom_data <> '{}'::jsonb)
        EXECUTE FUNCTION public.validate_contact_custom_data();
    $ex$;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Audit fields trigger for field_definitions
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_field_definition_audit_fields()
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

DROP TRIGGER IF EXISTS field_definition_audit_fields_trigger ON public.field_definitions;
CREATE TRIGGER field_definition_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.field_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_field_definition_audit_fields();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Audit log
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT audit.attach_trigger('public.field_definitions');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. RLS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.field_definitions ENABLE ROW LEVEL SECURITY;

-- SELECT: all authenticated users can read field definitions.
DROP POLICY IF EXISTS "field_definitions_select_authenticated" ON public.field_definitions;
CREATE POLICY "field_definitions_select_authenticated"
  ON public.field_definitions
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: admin only.
DROP POLICY IF EXISTS "field_definitions_insert_admin" ON public.field_definitions;
CREATE POLICY "field_definitions_insert_admin"
  ON public.field_definitions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_role() = 'admin');

-- UPDATE: admin only.
DROP POLICY IF EXISTS "field_definitions_update_admin" ON public.field_definitions;
CREATE POLICY "field_definitions_update_admin"
  ON public.field_definitions
  FOR UPDATE
  TO authenticated
  USING (public.current_user_role() = 'admin');

-- DELETE: admin only.
DROP POLICY IF EXISTS "field_definitions_delete_admin" ON public.field_definitions;
CREATE POLICY "field_definitions_delete_admin"
  ON public.field_definitions
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
