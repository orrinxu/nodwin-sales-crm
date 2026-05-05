-- supabase/migrations/0002_audit.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Audit log table and trigger primitives (ORR-186 / T-013).
--
-- Provides:
--   • Table    public.audit_log
--   • Function audit.log_change()       — generic row-level trigger
--   • Function audit.jsonb_diff()       — before/after diff
--   • Function audit.get_request_header() — safe header extractor
--   • Function audit.attach_trigger()   — convenience helper
--
-- Idempotent: safe to re-run.

-- ── Schema for audit helpers ─────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS audit;

-- ── Table ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name       text        NOT NULL,
  row_id           uuid        NOT NULL,
  operation        text        NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  changed_fields   jsonb,
  old_data         jsonb,
  new_data         jsonb,
  actor_user_id    uuid,
<<<<<<< fix/orr-203-tighten-rls-accounts
  actor_source     text,
=======
  actor_source     text        NOT NULL DEFAULT 'system',
>>>>>>> main
  actor_ip         text,
  actor_user_agent text,
  occurred_at      timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_log_table_row_occurred
  ON public.audit_log (table_name, row_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_audit_log_occurred_at
  ON public.audit_log (occurred_at DESC);

<<<<<<< fix/orr-203-tighten-rls-accounts
=======
-- ── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- The trigger function audit.log_change() is SECURITY DEFINER, so it bypasses
-- RLS when inserting rows. Direct INSERT/UPDATE/DELETE on audit_log are blocked
-- by default (no policies granted). Only SELECT is permitted to authorized roles.

CREATE POLICY audit_log_select ON public.audit_log
  FOR SELECT
  TO authenticated
  USING (true);

>>>>>>> main
-- ── Helper: safe header extraction from PostgREST request.headers GUC ────────
CREATE OR REPLACE FUNCTION audit.get_request_header(header_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _headers jsonb;
  _value   text;
BEGIN
  BEGIN
    _headers := nullif(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  IF _headers IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT h->>'value' INTO _value
  FROM   jsonb_array_elements(_headers) AS h
  WHERE  lower(h->>'header') = lower(header_name);

  RETURN _value;
END;
$$;

-- ── Helper: JSON diff ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION audit.jsonb_diff(old jsonb, new jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result  jsonb := '{}';
  key     text;
  old_val jsonb;
  new_val jsonb;
BEGIN
  IF old IS NULL AND new IS NULL THEN
    RETURN NULL;
  END IF;
  IF old IS NULL THEN
    RETURN new;
  END IF;
  IF new IS NULL THEN
    RETURN old;
  END IF;

  FOR key IN SELECT jsonb_object_keys(new)
  LOOP
    old_val := old->key;
    new_val := new->key;
    IF old_val IS DISTINCT FROM new_val THEN
      result := result || jsonb_build_object(key, jsonb_build_object('old', old_val, 'new', new_val));
    END IF;
  END LOOP;

  FOR key IN SELECT jsonb_object_keys(old)
  LOOP
    IF NOT new ? key THEN
      result := result || jsonb_build_object(key, jsonb_build_object('old', old->key, 'new', NULL));
    END IF;
  END LOOP;

  RETURN result;
END;
$$;

-- ── Trigger function ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor_user_id  uuid;
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

  IF TG_OP = 'DELETE' THEN
    _row_id := OLD.id;
    _old_data := to_jsonb(OLD);
    _new_data := NULL;
    _changed_fields := _old_data;

    INSERT INTO public.audit_log (
      table_name, row_id, operation, changed_fields, old_data, new_data,
      actor_user_id, actor_source, actor_ip, actor_user_agent, occurred_at
    ) VALUES (
      TG_TABLE_NAME, _row_id, TG_OP, _changed_fields, _old_data, _new_data,
      _actor_user_id,
<<<<<<< fix/orr-203-tighten-rls-accounts
      coalesce(audit.get_request_header('x-audit-source'), 'system'),
=======
      CASE WHEN _actor_user_id IS NOT NULL THEN 'user' ELSE 'system' END,
>>>>>>> main
      audit.get_request_header('x-forwarded-for'),
      audit.get_request_header('user-agent'),
      now()
    );
    RETURN OLD;

  ELSIF TG_OP = 'INSERT' THEN
    _row_id := NEW.id;
    _old_data := NULL;
    _new_data := to_jsonb(NEW);
    _changed_fields := _new_data;

    INSERT INTO public.audit_log (
      table_name, row_id, operation, changed_fields, old_data, new_data,
      actor_user_id, actor_source, actor_ip, actor_user_agent, occurred_at
    ) VALUES (
      TG_TABLE_NAME, _row_id, TG_OP, _changed_fields, _old_data, _new_data,
      _actor_user_id,
<<<<<<< fix/orr-203-tighten-rls-accounts
      coalesce(audit.get_request_header('x-audit-source'), 'system'),
=======
      CASE WHEN _actor_user_id IS NOT NULL THEN 'user' ELSE 'system' END,
>>>>>>> main
      audit.get_request_header('x-forwarded-for'),
      audit.get_request_header('user-agent'),
      now()
    );
    RETURN NEW;

  ELSE -- UPDATE
    _row_id := NEW.id;
    _old_data := to_jsonb(OLD);
    _new_data := to_jsonb(NEW);
    _changed_fields := audit.jsonb_diff(_old_data, _new_data);

    INSERT INTO public.audit_log (
      table_name, row_id, operation, changed_fields, old_data, new_data,
      actor_user_id, actor_source, actor_ip, actor_user_agent, occurred_at
    ) VALUES (
      TG_TABLE_NAME, _row_id, TG_OP, _changed_fields, _old_data, _new_data,
      _actor_user_id,
<<<<<<< fix/orr-203-tighten-rls-accounts
      coalesce(audit.get_request_header('x-audit-source'), 'system'),
=======
      CASE WHEN _actor_user_id IS NOT NULL THEN 'user' ELSE 'system' END,
>>>>>>> main
      audit.get_request_header('x-forwarded-for'),
      audit.get_request_header('user-agent'),
      now()
    );
    RETURN NEW;
  END IF;
END;
$$;

-- ── Convenience: attach audit trigger to a table ─────────────────────────────
<<<<<<< fix/orr-203-tighten-rls-accounts
=======
-- Note: target_table is regclass, so %s is safe — regclass::text always
-- produces a properly quoted identifier (or schema-qualified name).
>>>>>>> main
CREATE OR REPLACE FUNCTION audit.attach_trigger(target_table regclass)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trigger_name text := 'audit_trigger';
BEGIN
  EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s', trigger_name, target_table);
  EXECUTE format(
    'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %s FOR EACH ROW EXECUTE FUNCTION audit.log_change()',
    trigger_name, target_table
  );
END;
$$;
