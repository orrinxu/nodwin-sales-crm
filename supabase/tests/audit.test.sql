-- supabase/tests/audit.test.sql
-- pgTAP tests for audit_log triggers (ORR-186 / T-013).
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(35);

-- ── Setup: temporary test table ──────────────────────────────────────────────
DROP TABLE IF EXISTS test_audit_target CASCADE;
CREATE TABLE test_audit_target (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name  text,
  value integer
);

SELECT audit.attach_trigger('test_audit_target');

DELETE FROM public.audit_log WHERE table_name = 'test_audit_target';

-- ── RLS enabled ──────────────────────────────────────────────────────────────
SELECT has_rls('public', 'audit_log', 'audit_log has RLS enabled');

-- ── RLS policies exist ───────────────────────────────────────────────────────
SELECT has_policy('public', 'audit_log', 'audit_log_select_authenticated', 'SELECT policy exists');
SELECT has_policy('public', 'audit_log', 'audit_log_insert_admin', 'INSERT policy exists');
SELECT has_policy('public', 'audit_log', 'audit_log_update_admin', 'UPDATE policy exists');
SELECT has_policy('public', 'audit_log', 'audit_log_delete_admin', 'DELETE policy exists');

-- ── Schema hardening ─────────────────────────────────────────────────────────
SELECT col_not_null('public', 'audit_log', 'actor_source', 'actor_source is NOT NULL');
SELECT col_has_default('public', 'audit_log', 'actor_source', 'actor_source has default');
SELECT is(
  (SELECT column_default::text FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'actor_source'),
  '''system''::text',
  'actor_source defaults to system'
);

-- ── INSERT fires audit row ───────────────────────────────────────────────────
INSERT INTO test_audit_target (name, value) VALUES ('alpha', 1);

SELECT results_eq(
  $$SELECT operation, table_name, new_data->>'name', old_data IS NULL FROM public.audit_log WHERE table_name = 'test_audit_target' ORDER BY occurred_at DESC LIMIT 1$$,
  $$VALUES ('INSERT'::text, 'test_audit_target'::text, 'alpha'::text, true)$$,
  'INSERT creates audit row with new_data and null old_data'
);

-- ── UPDATE fires audit row with diff ─────────────────────────────────────────
UPDATE test_audit_target SET value = 2 WHERE name = 'alpha';

SELECT results_eq(
  $$SELECT operation, changed_fields->'value'->>'old', changed_fields->'value'->>'new' FROM public.audit_log WHERE table_name = 'test_audit_target' AND operation = 'UPDATE' ORDER BY occurred_at DESC LIMIT 1$$,
  $$VALUES ('UPDATE'::text, '1'::text, '2'::text)$$,
  'UPDATE audit row contains changed_fields diff'
);

-- ── DELETE fires audit row ───────────────────────────────────────────────────
DELETE FROM test_audit_target WHERE name = 'alpha';

SELECT results_eq(
  $$SELECT operation, old_data->>'name', new_data IS NULL FROM public.audit_log WHERE table_name = 'test_audit_target' AND operation = 'DELETE' ORDER BY occurred_at DESC LIMIT 1$$,
  $$VALUES ('DELETE'::text, 'alpha'::text, true)$$,
  'DELETE creates audit row with old_data and null new_data'
);

-- ── Verify total audit rows ──────────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM public.audit_log WHERE table_name = 'test_audit_target'),
  3,
  'Three total audit rows created (insert, update, delete)'
);

-- ── actor_source derived as 'user' when authenticated ─────────────────────────
DELETE FROM public.audit_log WHERE table_name = 'test_audit_target';

-- Top-level script context is plain SQL, not PL/pgSQL, so use SELECT (not
-- PERFORM) to call set_config. The enclosing BEGIN keeps is_local=true scoped.
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'role', 'authenticated')::text,
  true
);

INSERT INTO test_audit_target (name, value) VALUES ('beta', 10);

SELECT results_eq(
  $$SELECT actor_source FROM public.audit_log WHERE table_name = 'test_audit_target' AND operation = 'INSERT' AND new_data->>'name' = 'beta'$$,
  $$VALUES ('user'::text)$$,
  'actor_source is user when auth.uid() is present'
);

-- ── actor_source derived as 'system' when anonymous ───────────────────────────
DELETE FROM public.audit_log WHERE table_name = 'test_audit_target';

SELECT set_config('request.jwt.claims', '', true);

INSERT INTO test_audit_target (name, value) VALUES ('gamma', 20);

SELECT results_eq(
  $$SELECT actor_source FROM public.audit_log WHERE table_name = 'test_audit_target' AND operation = 'INSERT' AND new_data->>'name' = 'gamma'$$,
  $$VALUES ('system'::text)$$,
  'actor_source is system when auth.uid() is absent'
);

-- ── actor_source cannot be spoofed via HTTP header ────────────────────────────
DELETE FROM public.audit_log WHERE table_name = 'test_audit_target';

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'role', 'authenticated')::text,
  true
);
-- PostgREST exposes request.headers as a JSON OBJECT keyed by lowercased
-- header name (see the object shape used below), so the spoof attempt must use
-- that shape to reflect reality.
SELECT set_config(
  'request.headers',
  '{"x-audit-source":"mcp"}'::text,
  true
);

INSERT INTO test_audit_target (name, value) VALUES ('delta', 30);

SELECT results_eq(
  $$SELECT actor_source FROM public.audit_log WHERE table_name = 'test_audit_target' AND operation = 'INSERT' AND new_data->>'name' = 'delta'$$,
  $$VALUES ('user'::text)$$,
  'actor_source ignores x-audit-source header spoofing'
);

-- ── request.headers is a JSON OBJECT (real PostgREST shape) — regression for ──
-- ── "cannot extract elements from an object" on every API write (ORR-604) ─────
DELETE FROM public.audit_log WHERE table_name = 'test_audit_target';

SELECT set_config(
  'request.headers',
  '{"user-agent":"pgtap-suite/1.0","x-forwarded-for":"203.0.113.7"}'::text,
  true
);

-- Helper reads a header by key from the object without raising.
SELECT is(
  audit.get_request_header('user-agent'),
  'pgtap-suite/1.0',
  'get_request_header reads user-agent from object-shaped request.headers'
);
SELECT is(
  audit.get_request_header('x-forwarded-for'),
  '203.0.113.7',
  'get_request_header reads x-forwarded-for from object-shaped request.headers'
);

-- The write itself must succeed (previously aborted with "cannot extract
-- elements from an object") and capture the header metadata.
INSERT INTO test_audit_target (name, value) VALUES ('epsilon', 40);

SELECT results_eq(
  $$SELECT actor_user_agent, actor_ip FROM public.audit_log WHERE table_name = 'test_audit_target' AND new_data->>'name' = 'epsilon'$$,
  $$VALUES ('pgtap-suite/1.0'::text, '203.0.113.7'::text)$$,
  'INSERT with object-shaped request.headers succeeds and records actor_user_agent + actor_ip'
);

-- Defensive: a non-object headers value returns NULL rather than raising, so a
-- malformed value can never abort the underlying write.
SELECT set_config('request.headers', '[{"header":"user-agent","value":"legacy"}]'::text, true);
SELECT is(
  audit.get_request_header('user-agent'),
  NULL,
  'get_request_header returns NULL (no error) when request.headers is not an object'
);

SELECT set_config('request.headers', '', true);

-- ── RLS: non-admin authenticated user cannot SELECT audit rows ────────────────
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('66666666-6666-6666-6666-666666666666', 'audit_rep@nodwin.com', '{"full_name":"Audit Rep"}'),
  ('77777777-7777-7777-7777-777777777777', 'audit_admin@nodwin.com', '{"full_name":"Audit Admin"}')
ON CONFLICT (id) DO NOTHING;

-- Clear the JWT claims set by the previous (header-spoofing) test so that
-- auth.uid() is NULL here. The on_auth_user_created trigger already created
-- default-role public.users rows for the inserts above, so this upsert changes
-- audit_admin to 'admin'; the prevent_role_escalation trigger only permits that
-- role change from a system context (auth.uid() IS NULL) or as an admin.
SELECT set_config('request.jwt.claims', '', true);

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('66666666-6666-6666-6666-666666666666', 'audit_rep@nodwin.com', 'Audit Rep', 'sales_rep', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('77777777-7777-7777-7777-777777777777', 'audit_admin@nodwin.com', 'Audit Admin', 'admin', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT (id) DO UPDATE SET
  full_name          = EXCLUDED.full_name,
  primary_role       = EXCLUDED.primary_role,
  primary_entity_id  = EXCLUDED.primary_entity_id;

SELECT tests.as_user('audit_rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.audit_log WHERE table_name = 'test_audit_target'$$,
  'non-admin cannot SELECT from audit_log'
);

SELECT tests.as_user('audit_admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.audit_log WHERE table_name = 'test_audit_target'$$,
  'admin CAN SELECT from audit_log'
);

-- ── Verify audit_log schema ──────────────────────────────────────────────────
SELECT has_table('public', 'audit_log', 'audit_log table exists');
SELECT has_column('public', 'audit_log', 'table_name', 'audit_log has table_name');
SELECT has_column('public', 'audit_log', 'row_id', 'audit_log has row_id');
SELECT has_column('public', 'audit_log', 'operation', 'audit_log has operation');
SELECT has_column('public', 'audit_log', 'changed_fields', 'audit_log has changed_fields');
SELECT has_column('public', 'audit_log', 'old_data', 'audit_log has old_data');
SELECT has_column('public', 'audit_log', 'new_data', 'audit_log has new_data');
SELECT has_column('public', 'audit_log', 'actor_user_id', 'audit_log has actor_user_id');
SELECT has_column('public', 'audit_log', 'actor_source', 'audit_log has actor_source');
SELECT has_column('public', 'audit_log', 'actor_ip', 'audit_log has actor_ip');
SELECT has_column('public', 'audit_log', 'actor_user_agent', 'audit_log has actor_user_agent');
SELECT has_column('public', 'audit_log', 'occurred_at', 'audit_log has occurred_at');

-- ── Verify indexes exist ─────────────────────────────────────────────────────
SELECT has_index('public', 'audit_log', 'idx_audit_log_table_row_occurred', 'index on (table_name, row_id, occurred_at) exists');
SELECT has_index('public', 'audit_log', 'idx_audit_log_occurred_at', 'index on occurred_at exists');

-- ── Verify functions exist ───────────────────────────────────────────────────
-- has_function checks omitted due to pgTAP schema-search quirk with trigger-returning functions;
-- functions are verified implicitly by the trigger tests above.
-- SELECT has_function('audit', 'log_change', 'audit.log_change trigger function exists');
-- SELECT has_function('audit', 'jsonb_diff', 'audit.jsonb_diff function exists');
-- SELECT has_function('audit', 'get_request_header', 'audit.get_request_header function exists');
-- SELECT has_function('audit', 'attach_trigger', 'audit.attach_trigger function exists');

-- ── Cleanup ──────────────────────────────────────────────────────────────────
-- Restore the owning role; the last assertions ran as `authenticated`, which
-- may not drop a table created by postgres.
RESET ROLE;
DROP TABLE test_audit_target CASCADE;

SELECT * FROM finish();

ROLLBACK;
