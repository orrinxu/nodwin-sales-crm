-- pgTAP: round-2 perf index pass (ORR-770)
-- Verifies the two structural index gaps closed by
-- 20260717000000_perf_index_pass.sql exist with the right columns. Indexes only,
-- no behaviour to assert.
BEGIN;
SELECT plan(4);

-- 1. Reporting-chain recursion join (users.manager_user_id) — was a Seq Scan.
SELECT has_index(
  'public',
  'users',
  'idx_users_manager_user_id',
  ARRAY['manager_user_id'],
  'users.manager_user_id is indexed (reporting-chain recursion)'
);

-- 2. Accounts list created_at sort (parallels ORR-759 idx_contacts_created_at).
SELECT has_index(
  'public',
  'accounts',
  'idx_accounts_created_at',
  ARRAY['created_at'],
  'accounts.created_at is indexed (list sort)'
);

-- Both are partial indexes — assert the predicates so a future non-partial
-- rewrite (which would bloat the index / change coverage) trips the test.
SELECT is(
  (SELECT pg_get_expr(i.indpred, i.indrelid)
     FROM pg_index i
     JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'idx_users_manager_user_id'),
  '(manager_user_id IS NOT NULL)',
  'idx_users_manager_user_id is partial WHERE manager_user_id IS NOT NULL'
);

SELECT is(
  (SELECT pg_get_expr(i.indpred, i.indrelid)
     FROM pg_index i
     JOIN pg_class c ON c.oid = i.indexrelid
    WHERE c.relname = 'idx_accounts_created_at'),
  '(deleted_at IS NULL)',
  'idx_accounts_created_at is partial WHERE deleted_at IS NULL'
);

SELECT * FROM finish();
ROLLBACK;
