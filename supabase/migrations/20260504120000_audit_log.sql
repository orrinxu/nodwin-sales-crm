-- supabase/migrations/20260504120000_audit_log.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Audit log primitives (Phase 1).
--
-- Creates:
--   • public.audit_log      — append-only table for all audited changes
--   • audit.log_change()    — reusable SECURITY DEFINER trigger function
--
-- Phase 2 migrations will attach the trigger to individual tables
-- (opportunities, accounts, contacts, etc.).  This migration only builds
-- the infrastructure.
--
-- Idempotent: safe to re-run on an existing schema.

-- ── Schema ────────────────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS audit;

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.audit_log (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  action       text        NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  table_name   text        NOT NULL,
  row_id       text,
  actor_id     uuid,
  actor_email  text,
  ip_address   text,
  user_agent   text,
  before       jsonb,
  after        jsonb,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ── RLS policies ──────────────────────────────────────────────────────────────
-- service_role has BYPASSRLS in Supabase; these policies are explicit
-- documentation that the operations are intentionally permitted.
-- No other role may read or write audit_log directly.
-- The audit.log_change() trigger function is SECURITY DEFINER and runs as
-- the function owner (postgres), which also bypasses RLS.

DROP POLICY IF EXISTS "service_role_select_audit_log" ON public.audit_log;
CREATE POLICY "service_role_select_audit_log"
  ON public.audit_log
  FOR SELECT
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "service_role_insert_audit_log" ON public.audit_log;
CREATE POLICY "service_role_insert_audit_log"
  ON public.audit_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ── audit.log_change() ────────────────────────────────────────────────────────
-- Reusable AFTER INSERT OR UPDATE OR DELETE trigger function.
--
-- Attach to any table with:
--   CREATE TRIGGER audit_<table_name>
--     AFTER INSERT OR UPDATE OR DELETE ON <schema>.<table_name>
--     FOR EACH ROW EXECUTE FUNCTION audit.log_change();
--
-- Actor and request metadata come from PostgREST session settings populated
-- by Supabase on each API request.  When the function is invoked outside a
-- PostgREST context (direct DB connections, scheduled jobs) these settings
-- are absent and the corresponding columns are stored as NULL.
--
-- The function assumes audited tables have an `id` column.  row_id is
-- extracted from to_jsonb(NEW/OLD)->>'id' so mismatches do not crash the
-- trigger — row_id is just stored as NULL instead.

CREATE OR REPLACE FUNCTION audit.log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, audit, auth, extensions
AS $$
DECLARE
  _claims      jsonb;
  _headers     jsonb;
  _actor_id    uuid;
  _actor_email text;
  _ip_address  text;
  _user_agent  text;
  _row_id      text;
  _before      jsonb;
  _after       jsonb;
BEGIN
  -- JWT claims set by PostgREST from the request Authorization header.
  -- nullif guards against an empty string set by some test harnesses.
  BEGIN
    _claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    _claims := NULL;
  END;

  _actor_id    := (_claims->>'sub')::uuid;
  _actor_email := _claims->>'email';

  -- Request headers set by PostgREST as a JSON object with lowercase keys.
  -- Example: {"x-forwarded-for":"1.2.3.4","user-agent":"Mozilla/5.0 ..."}
  BEGIN
    _headers := nullif(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    _headers := NULL;
  END;

  _ip_address := coalesce(
    _headers->>'x-forwarded-for',
    _headers->>'x-real-ip'
  );
  _user_agent := _headers->>'user-agent';

  -- Row snapshots.  to_jsonb() works with any row type, so this function
  -- is safe to attach to any table regardless of column layout.
  CASE TG_OP
    WHEN 'INSERT' THEN
      _row_id := to_jsonb(NEW)->>'id';
      _before := NULL;
      _after  := to_jsonb(NEW);
    WHEN 'UPDATE' THEN
      _row_id := to_jsonb(NEW)->>'id';
      _before := to_jsonb(OLD);
      _after  := to_jsonb(NEW);
    WHEN 'DELETE' THEN
      _row_id := to_jsonb(OLD)->>'id';
      _before := to_jsonb(OLD);
      _after  := NULL;
  END CASE;

  INSERT INTO public.audit_log (
    action, table_name, row_id,
    actor_id, actor_email,
    ip_address, user_agent,
    before, after,
    occurred_at
  ) VALUES (
    TG_OP, TG_TABLE_NAME, _row_id,
    _actor_id, _actor_email,
    _ip_address, _user_agent,
    _before, _after,
    now()
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
