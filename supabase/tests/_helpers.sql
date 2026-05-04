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

  EXECUTE 'SET LOCAL ROLE authenticated';
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
  EXECUTE 'SET LOCAL ROLE anon';
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
  EXECUTE 'SET LOCAL ROLE postgres';
END;
$$;

------------------------------------------------------------------------------
-- tests.assert_can_select(table_name, predicate, description)
-- Pass if at least one row matching predicate is visible under the current
-- role.  RLS on SELECT filters rows silently (no exception on deny).
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tests.assert_can_select(
  table_name  text,
  predicate   text  DEFAULT 'true',
  description text  DEFAULT NULL
)
RETURNS void
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
  PERFORM ok(_count > 0, _desc);
END;
$$;

------------------------------------------------------------------------------
-- tests.assert_cannot_select(table_name, predicate, description)
-- Pass if zero rows matching predicate are visible (RLS hides them all).
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tests.assert_cannot_select(
  table_name  text,
  predicate   text  DEFAULT 'true',
  description text  DEFAULT NULL
)
RETURNS void
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
  PERFORM ok(_count = 0, _desc);
END;
$$;

------------------------------------------------------------------------------
-- tests.assert_can_insert(table_name, payload, description)
-- Pass if INSERT succeeds (RLS WITH CHECK allows the row).
-- payload: SQL values fragment, e.g. (gen_random_uuid(), 'foo', 'bar')
-- NOTE: payload is trusted SQL — test-only, never use in production code.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tests.assert_can_insert(
  table_name  text,
  payload     text,
  description text  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  _desc text := COALESCE(description, format('can INSERT into %I', table_name));
BEGIN
  BEGIN
    EXECUTE format('INSERT INTO %I VALUES %s', table_name, payload);
    PERFORM ok(true, _desc);
  EXCEPTION WHEN OTHERS THEN
    PERFORM ok(false, format('%s — raised %s: %s', _desc, SQLSTATE, SQLERRM));
  END;
END;
$$;

------------------------------------------------------------------------------
-- tests.assert_cannot_insert(table_name, payload, description)
-- Pass if INSERT raises insufficient_privilege (RLS WITH CHECK blocked it).
-- Any other exception is treated as an unexpected failure.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tests.assert_cannot_insert(
  table_name  text,
  payload     text,
  description text  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  _desc text := COALESCE(description, format('cannot INSERT into %I', table_name));
BEGIN
  BEGIN
    EXECUTE format('INSERT INTO %I VALUES %s', table_name, payload);
    PERFORM ok(
      false,
      format('%s — INSERT succeeded but should have been blocked', _desc)
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      PERFORM ok(true, _desc);
    WHEN OTHERS THEN
      PERFORM ok(
        false,
        format('%s — unexpected %s: %s', _desc, SQLSTATE, SQLERRM)
      );
  END;
END;
$$;

-- Valid 0-test pgTAP suite when this file is executed standalone.
SELECT plan(0);
SELECT * FROM finish();
