-- supabase/migrations/20260702100000_fix_audit_request_header_object.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Fix: every write through PostgREST aborted with
--   ERROR: cannot extract elements from an object
--
-- Root cause: audit.get_request_header() (0002_audit.sql) read the
-- `request.headers` setting with jsonb_array_elements(), assuming an ARRAY of
-- {header, value} objects. PostgREST actually exposes request.headers as a JSON
-- OBJECT keyed by lowercased header name, e.g.
--   {"user-agent": "curl/8", "x-forwarded-for": "1.2.3.4"}
-- Calling jsonb_array_elements() on an object raises the error above. The
-- audit trigger (audit.log_change) calls this helper for actor_ip and
-- actor_user_agent on every INSERT/UPDATE/DELETE, so any write carrying a
-- populated headers object (i.e. every real API request) was aborted. Writes
-- via psql were unaffected because request.headers is unset there, and the unit
-- suite missed it because the existing test fed an array-shaped header value.
--
-- The surrounding EXCEPTION guard only wrapped the ::jsonb cast, not the
-- element extraction, so the error propagated out of the trigger and rolled
-- back the caller's statement.
--
-- Fix: read the header by key from the object. Also guard on jsonb_typeof so a
-- non-object value (e.g. an unexpected array from some proxy) returns NULL
-- rather than throwing — audit metadata is best-effort and must never abort the
-- underlying write.

CREATE OR REPLACE FUNCTION audit.get_request_header(header_name text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _headers jsonb;
BEGIN
  BEGIN
    _headers := nullif(current_setting('request.headers', true), '')::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;

  -- Best-effort: only read from an object-shaped headers value. Anything else
  -- (null, array, scalar) yields NULL instead of raising, so the audit trigger
  -- can never abort the write it is recording.
  IF _headers IS NULL OR jsonb_typeof(_headers) <> 'object' THEN
    RETURN NULL;
  END IF;

  -- PostgREST exposes request.headers as a JSON object keyed by lowercased
  -- header name. header_name is lowercased to match.
  RETURN _headers ->> lower(header_name);
END;
$$;
