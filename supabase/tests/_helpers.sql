-- supabase/tests/_helpers.sql
-- pgTAP RLS test helpers for Nodwin Sales CRM.
--
-- `supabase test db` runs all .sql files alphabetically; this file's
-- underscore prefix ensures it runs before *.test.sql files.
-- When run standalone it is a valid pgTAP suite with 0 tests (creates
-- the helpers as committed fixtures).  Test files rely on those fixtures
-- without needing to \ir this file.
--
-- HIGH-RISK FILE — see AGENTS.md §6.

-- Enable pgTAP (idempotent — safe to call on every test run).
CREATE EXTENSION IF NOT EXISTS pgtap;

-- Schema for all test helpers.
CREATE SCHEMA IF NOT EXISTS tests;

------------------------------------------------------------------------------
-- tests.as_user(email)
-- Switch the session JWT context to the user identified by email.
-- After this call, auth.uid() returns that user's UUID and the session
-- role is 'authenticated', so RLS policies are evaluated for that user.
-- Uses SET LOCAL so the role change is automatically reverted on ROLLBACK.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tests.as_user(email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  _user_id uuid;
BEGIN
  SELECT id INTO _user_id
  FROM auth.users
  WHERE auth.users.email = as_user.email;

  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'tests.as_user: no auth.users row with email %', email;
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',   _user_id::text,
      'role',  'authenticated',
      'email', email
    )::text,
    true  -- LOCAL: reverted on transaction rollback
  );

END;
$$;

------------------------------------------------------------------------------
-- tests.as_anon()
-- Switch context to the anonymous (unauthenticated) role.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tests.as_anon()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

------------------------------------------------------------------------------
-- tests.as_service_role()
-- Restore full superuser access.
-- Use ONLY in test setup/teardown — calling this before an assertion
-- defeats RLS testing because superusers bypass RLS.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tests.as_service_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$;

------------------------------------------------------------------------------
-- tests.assert_can_select(table_name, predicate, description)
-- Pass if at least one row matching predicate is visible under the current
-- role.  RLS on SELECT filters rows silently (no exception on deny).
--
-- NOTE: these assertion helpers RETURN the pgTAP `ok(...)` line as text so
-- that `SELECT tests.assert_...()` emits a proper TAP line.  Wrapping ok() in
-- PERFORM (the previous approach) advanced pgTAP's internal counter but
-- printed nothing, causing "planned N but ran M" plan mismatches.
-- DROP first because CREATE OR REPLACE cannot change a function's return type
-- (they were previously RETURNS void); this keeps the file idempotent.
------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS tests.assert_can_select(text, text, text);
CREATE OR REPLACE FUNCTION tests.assert_can_select(
  table_name  text,
  predicate   text  DEFAULT 'true',
  description text  DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  _count bigint;
  _desc  text;
BEGIN
  _desc := COALESCE(
    description,
    format('can SELECT from %I WHERE %s', table_name, predicate)
  );
  EXECUTE format('SELECT COUNT(*) FROM %I WHERE %s', table_name, predicate)
    INTO _count;
  RETURN ok(_count > 0, _desc);
END;
$$;

------------------------------------------------------------------------------
-- tests.assert_cannot_select(table_name, predicate, description)
-- Pass if zero rows matching predicate are visible (RLS hides them all).
------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS tests.assert_cannot_select(text, text, text);
CREATE OR REPLACE FUNCTION tests.assert_cannot_select(
  table_name  text,
  predicate   text  DEFAULT 'true',
  description text  DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  _count bigint;
  _desc  text;
BEGIN
  _desc := COALESCE(
    description,
    format('cannot SELECT from %I WHERE %s', table_name, predicate)
  );
  EXECUTE format('SELECT COUNT(*) FROM %I WHERE %s', table_name, predicate)
    INTO _count;
  RETURN ok(_count = 0, _desc);
END;
$$;

------------------------------------------------------------------------------
-- tests.assert_can_insert(table_name, payload, description)
-- Pass if INSERT succeeds (RLS WITH CHECK allows the row).
-- payload: SQL values fragment, e.g. (gen_random_uuid(), 'foo', 'bar')
-- NOTE: payload is trusted SQL — test-only, never use in production code.
------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS tests.assert_can_insert(text, text, text);
CREATE OR REPLACE FUNCTION tests.assert_can_insert(
  table_name  text,
  payload     text,
  description text  DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  _desc text := COALESCE(description, format('can INSERT into %I', table_name));
BEGIN
  BEGIN
    EXECUTE format('INSERT INTO %I VALUES %s', table_name, payload);
    RETURN ok(true, _desc);
  EXCEPTION WHEN OTHERS THEN
    RETURN ok(false, format('%s — raised %s: %s', _desc, SQLSTATE, SQLERRM));
  END;
END;
$$;

------------------------------------------------------------------------------
-- tests.assert_cannot_insert(table_name, payload, description)
-- Pass if INSERT raises insufficient_privilege (RLS WITH CHECK blocked it).
-- Any other exception is treated as an unexpected failure.
------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS tests.assert_cannot_insert(text, text, text);
CREATE OR REPLACE FUNCTION tests.assert_cannot_insert(
  table_name  text,
  payload     text,
  description text  DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  _desc text := COALESCE(description, format('cannot INSERT into %I', table_name));
BEGIN
  BEGIN
    EXECUTE format('INSERT INTO %I VALUES %s', table_name, payload);
    RETURN ok(
      false,
      format('%s — INSERT succeeded but should have been blocked', _desc)
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      RETURN ok(true, _desc);
    WHEN OTHERS THEN
      RETURN ok(
        false,
        format('%s — unexpected %s: %s', _desc, SQLSTATE, SQLERRM)
      );
  END;
END;
$$;

------------------------------------------------------------------------------
-- has_rls(schema, table, description)
-- pgTAP-style assertion: passes when ROW LEVEL SECURITY is enabled on the
-- given table.  pgTAP itself ships no has_rls(); this fills that gap so test
-- files can assert RLS is on with a single call.  Defined in `public` (where
-- pgTAP lives) so it resolves unqualified like the built-in assertions.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_rls(
  schema_name text,
  table_name  text,
  description text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  _enabled boolean;
  _desc    text := COALESCE(
    description,
    format('%I.%I has RLS enabled', schema_name, table_name)
  );
BEGIN
  SELECT c.relrowsecurity
    INTO _enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = schema_name
    AND c.relname = table_name;

  IF _enabled IS NULL THEN
    RETURN ok(false, format('%s — relation %I.%I not found', _desc, schema_name, table_name));
  END IF;

  RETURN ok(_enabled, _desc);
END;
$$;

------------------------------------------------------------------------------
-- has_policy(schema, table, policy, description)
-- pgTAP-style assertion: passes when a named RLS policy exists on the table.
-- This pgTAP build ships no has_policy(); this fills the gap.  Defined in
-- `public` (where pgTAP lives) so it resolves unqualified like the built-ins.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_policy(
  schema_name text,
  table_name  text,
  policy_name text,
  description text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  _exists boolean;
  _desc   text := COALESCE(
    description,
    format('%I.%I has policy %I', schema_name, table_name, policy_name)
  );
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c     ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = schema_name
      AND c.relname = table_name
      AND p.polname = policy_name
  )
  INTO _exists;

  RETURN ok(_exists, _desc);
END;
$$;

-- Grant execute on test helpers to roles used in RLS testing.
-- service_role is included so tests that exercise service_role policies can
-- still call the context helpers (e.g. tests.as_service_role()) while the
-- session role is service_role.
GRANT USAGE ON SCHEMA tests TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION tests.assert_can_select(text, text, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION tests.assert_cannot_select(text, text, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION tests.assert_can_insert(text, text, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION tests.assert_cannot_insert(text, text, text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION tests.as_user(text) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION tests.as_anon() TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION tests.as_service_role() TO authenticated, anon, service_role;

-- Valid 1-test pgTAP suite when this file is executed standalone.
SELECT plan(1);
SELECT pass('test helpers loaded');
SELECT * FROM finish();
