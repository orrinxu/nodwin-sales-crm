-- supabase/tests/audit_log.test.sql
-- pgTAP tests for the audit_log table and audit.log_change() trigger function.
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db
-- All changes are rolled back; nothing persists after the test run.

BEGIN;

SELECT plan(19);

-- ── Fixture: throwaway table with the audit trigger attached ──────────────────
-- The temp table is automatically dropped on ROLLBACK/session end.

CREATE TEMP TABLE _audit_test_items (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name  text NOT NULL
);

CREATE TRIGGER audit__audit_test_items
  AFTER INSERT OR UPDATE OR DELETE ON _audit_test_items
  FOR EACH ROW EXECUTE FUNCTION audit.log_change();

-- ── Fixture: auth.users row for JWT actor tests ───────────────────────────────

INSERT INTO auth.users (
  instance_id, id, email,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  aud, role, encrypted_password, email_confirmed_at
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'auditor@nodwin.com',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(), now(),
  'authenticated', 'authenticated',
  '', now()
) ON CONFLICT DO NOTHING;

-- ── Simulate PostgREST session context ────────────────────────────────────────
-- These are the settings PostgREST populates on every inbound API request.

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a1b2c3d4-e5f6-7890-abcd-ef1234567890","email":"auditor@nodwin.com","role":"authenticated"}',
  true  -- LOCAL: reset on ROLLBACK
);

SELECT set_config(
  'request.headers',
  '{"x-forwarded-for":"192.0.2.1","user-agent":"TestAgent/1.0"}',
  true
);

-- ── INSERT tests ──────────────────────────────────────────────────────────────

INSERT INTO _audit_test_items (id, name)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'first item');

SELECT is(
  (SELECT count(*)::int FROM public.audit_log
   WHERE table_name = '_audit_test_items' AND action = 'INSERT'),
  1,
  'INSERT trigger creates exactly one audit_log entry'
);

SELECT is(
  (SELECT row_id FROM public.audit_log
   WHERE table_name = '_audit_test_items' AND action = 'INSERT'
   LIMIT 1),
  'aaaaaaaa-0000-0000-0000-000000000001',
  'INSERT audit entry captures row_id'
);

SELECT is(
  (SELECT before FROM public.audit_log
   WHERE table_name = '_audit_test_items' AND action = 'INSERT'
   LIMIT 1),
  NULL,
  'INSERT audit entry has NULL before'
);

SELECT ok(
  (SELECT after->>'name' FROM public.audit_log
   WHERE table_name = '_audit_test_items' AND action = 'INSERT'
   LIMIT 1) = 'first item',
  'INSERT audit entry captures after snapshot'
);

SELECT is(
  (SELECT actor_id FROM public.audit_log
   WHERE table_name = '_audit_test_items' AND action = 'INSERT'
   LIMIT 1),
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
  'INSERT audit entry captures actor_id from JWT sub claim'
);

SELECT is(
  (SELECT actor_email FROM public.audit_log
   WHERE table_name = '_audit_test_items' AND action = 'INSERT'
   LIMIT 1),
  'auditor@nodwin.com',
  'INSERT audit entry captures actor_email from JWT email claim'
);

SELECT is(
  (SELECT ip_address FROM public.audit_log
   WHERE table_name = '_audit_test_items' AND action = 'INSERT'
   LIMIT 1),
  '192.0.2.1',
  'INSERT audit entry captures IP from x-forwarded-for header'
);

SELECT is(
  (SELECT user_agent FROM public.audit_log
   WHERE table_name = '_audit_test_items' AND action = 'INSERT'
   LIMIT 1),
  'TestAgent/1.0',
  'INSERT audit entry captures user-agent from request headers'
);

-- ── UPDATE tests ──────────────────────────────────────────────────────────────

UPDATE _audit_test_items
SET name = 'updated item'
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

SELECT is(
  (SELECT count(*)::int FROM public.audit_log
   WHERE table_name = '_audit_test_items' AND action = 'UPDATE'),
  1,
  'UPDATE trigger creates exactly one audit_log entry'
);

SELECT ok(
  (SELECT before->>'name' FROM public.audit_log
   WHERE table_name = '_audit_test_items' AND action = 'UPDATE'
   LIMIT 1) = 'first item',
  'UPDATE audit entry before snapshot contains pre-update value'
);

SELECT ok(
  (SELECT after->>'name' FROM public.audit_log
   WHERE table_name = '_audit_test_items' AND action = 'UPDATE'
   LIMIT 1) = 'updated item',
  'UPDATE audit entry after snapshot contains post-update value'
);

-- ── DELETE tests ──────────────────────────────────────────────────────────────

DELETE FROM _audit_test_items
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';

SELECT is(
  (SELECT count(*)::int FROM public.audit_log
   WHERE table_name = '_audit_test_items' AND action = 'DELETE'),
  1,
  'DELETE trigger creates exactly one audit_log entry'
);

SELECT ok(
  (SELECT before->>'name' FROM public.audit_log
   WHERE table_name = '_audit_test_items' AND action = 'DELETE'
   LIMIT 1) = 'updated item',
  'DELETE audit entry before snapshot contains the deleted row'
);

SELECT is(
  (SELECT after FROM public.audit_log
   WHERE table_name = '_audit_test_items' AND action = 'DELETE'
   LIMIT 1),
  NULL,
  'DELETE audit entry has NULL after'
);

-- ── occurred_at is populated ──────────────────────────────────────────────────

SELECT ok(
  (SELECT occurred_at FROM public.audit_log
   WHERE table_name = '_audit_test_items'
   ORDER BY occurred_at DESC LIMIT 1) IS NOT NULL,
  'audit entry occurred_at is populated'
);

-- ── RLS denial tests ──────────────────────────────────────────────────────────
-- Verify that authenticated and anon roles cannot directly read/write audit_log.
-- The SECURITY DEFINER trigger path bypasses RLS, so these tests cover the direct
-- access path that the trigger does NOT exercise.

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$INSERT INTO public.audit_log (action, table_name, row_id) VALUES ('INSERT','foo','1')$$,
  '42501',
  'new row violates row-level security policy for table "audit_log"',
  'authenticated role cannot directly INSERT into audit_log'
);

SELECT throws_ok(
  $$SELECT * FROM public.audit_log LIMIT 1$$,
  '42501',
  NULL,
  'authenticated role cannot directly SELECT from audit_log'
);

RESET ROLE;

SET LOCAL ROLE anon;

SELECT throws_ok(
  $$INSERT INTO public.audit_log (action, table_name, row_id) VALUES ('INSERT','foo','1')$$,
  '42501',
  NULL,
  'anon role cannot directly INSERT into audit_log'
);

SELECT throws_ok(
  $$SELECT * FROM public.audit_log LIMIT 1$$,
  '42501',
  NULL,
  'anon role cannot directly SELECT from audit_log'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
