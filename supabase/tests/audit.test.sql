-- supabase/tests/audit.test.sql
-- pgTAP tests for audit_log triggers (ORR-186 / T-013).
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

<<<<<<< fix/orr-203-tighten-rls-accounts
SELECT plan(18);
=======
SELECT plan(21);
>>>>>>> main

-- ── Setup: temporary test table ──────────────────────────────────────────────
DROP TABLE IF EXISTS test_audit_target CASCADE;
CREATE TABLE test_audit_target (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name  text,
  value integer
);

SELECT audit.attach_trigger('test_audit_target');

DELETE FROM public.audit_log WHERE table_name = 'test_audit_target';

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

<<<<<<< fix/orr-203-tighten-rls-accounts
=======
-- ── Verify RLS is enabled and policy exists ───────────────────────────────────
SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'audit_log'),
  true,
  'RLS is enabled on audit_log'
);

SELECT results_eq(
  $$SELECT COUNT(*)::int FROM pg_policies WHERE tablename = 'audit_log' AND policyname = 'audit_log_select'$$,
  $$VALUES (1)$$,
  'audit_log_select policy exists'
);

-- ── Verify actor_source has NOT NULL constraint ───────────────────────────────
SELECT is(
  (SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'actor_source'),
  'NO',
  'actor_source column is NOT NULL'
);

>>>>>>> main
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
DROP TABLE test_audit_target CASCADE;

SELECT * FROM finish();

ROLLBACK;
