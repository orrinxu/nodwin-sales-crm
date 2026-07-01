-- supabase/tests/data_management.test.sql
-- pgTAP tests for Data Management RLS policies (ORR-527 / ORR-509-db).
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Covers: finance_export_config, import_jobs.
--
-- Run with: supabase test db
-- All changes are rolled back; nothing persists after the test run.

BEGIN;

SELECT plan(32);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com',  '{"full_name":"Admin User"}'),
  ('33333333-3333-3333-3333-333333333333', 'rep2@nodwin.com',   '{"full_name":"Sales Rep Two"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.entities (id, name, base_currency)
VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Test Entity', 'USD'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Second Entity', 'USD'),
  ('abababab-abab-abab-abab-abababababab', 'Third Entity', 'USD')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   'Sales Rep',      'sales_rep', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com',  'Admin User',     'admin',     'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  ('33333333-3333-3333-3333-333333333333', 'rep2@nodwin.com',   'Sales Rep Two',  'sales_rep', 'ffffffff-ffff-ffff-ffff-ffffffffffff')
ON CONFLICT (id) DO UPDATE SET
  full_name          = EXCLUDED.full_name,
  primary_role       = EXCLUDED.primary_role,
  primary_entity_id  = EXCLUDED.primary_entity_id;

-- ============================================================================
-- TABLE: finance_export_config
-- ============================================================================

-- 1. Anon cannot read finance_export_config
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.finance_export_config WHERE true$$,
  'anon cannot read finance_export_config'
);

-- 2. Sales rep can read finance_export_config (empty table, not blocked)
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.finance_export_config WHERE true$$,
  'sales rep can read finance_export_config (empty, not blocked)'
);

-- 3. Sales rep cannot insert finance_export_config
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.finance_export_config (id, entity_id, destination_drive_folder_id) VALUES (gen_random_uuid(), 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'folder_001')$$,
  '42501',
  NULL,
  'sales rep cannot insert finance_export_config'
);

-- 4. Admin can insert finance_export_config
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.finance_export_config (id, entity_id, destination_drive_folder_id, format, schedule) VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'folder_finance_001', '{"currency":"USD","columns":["deal_id","amount","close_date"]}', '0 6 * * *')$$,
  'admin can insert finance_export_config'
);

-- 5. Admin can read inserted finance_export_config
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT destination_drive_folder_id FROM public.finance_export_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'folder_finance_001',
  'admin can read finance_export_config'
);

-- 6. Sales rep can read the seeded row
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.finance_export_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'$$,
  'sales rep can read finance_export_config with data'
);

-- 7. Sales rep cannot update finance_export_config
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.finance_export_config SET destination_drive_folder_id = 'hacked' WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT is(
  (SELECT destination_drive_folder_id FROM public.finance_export_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'folder_finance_001',
  'sales rep cannot update finance_export_config (silently blocked)'
);

-- 8. Admin can update finance_export_config
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.finance_export_config SET destination_drive_folder_id = 'folder_finance_updated' WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT is(
  (SELECT destination_drive_folder_id FROM public.finance_export_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'folder_finance_updated',
  'admin can update finance_export_config'
);

-- 9. Sales rep cannot delete finance_export_config
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.finance_export_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT isnt_empty(
  $$SELECT id FROM public.finance_export_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'$$,
  'sales rep cannot delete finance_export_config (silently blocked)'
);

-- 10. Admin can delete finance_export_config
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.finance_export_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT is_empty(
  $$SELECT id FROM public.finance_export_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'$$,
  'admin can delete finance_export_config'
);

-- Seed finance_export_config again for remaining tests
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
INSERT INTO public.finance_export_config (id, entity_id, destination_drive_folder_id, schedule) VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'folder_finance_001', '0 6 * * *');
INSERT INTO public.finance_export_config (id, entity_id, destination_drive_folder_id, schedule) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'ffffffff-ffff-ffff-ffff-ffffffffffff', 'folder_finance_002', '0 6 * * *');

-- ============================================================================
-- TABLE: import_jobs
-- ============================================================================

-- 11. Anon cannot read import_jobs
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.import_jobs WHERE true$$,
  'anon cannot read import_jobs'
);

-- 12. Sales rep can read own import_jobs (empty, not blocked)
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.import_jobs WHERE created_by = auth.uid()$$,
  'sales rep can read own import_jobs (empty, not blocked)'
);

-- 13. Sales rep cannot insert import_jobs
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.import_jobs (id, entity_id, kind, target_entity_type, created_by) VALUES (gen_random_uuid(), 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'export', 'accounts', '11111111-1111-1111-1111-111111111111')$$,
  '42501',
  NULL,
  'sales rep cannot insert import_jobs'
);

-- 14. Admin can insert import_jobs
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.import_jobs (id, entity_id, kind, target_entity_type, status, created_by) VALUES ('aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'export', 'accounts', 'pending', '22222222-2222-2222-2222-222222222222')$$,
  'admin can insert import_jobs'
);

-- 15. Admin can read own import_jobs
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT kind FROM public.import_jobs WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'export',
  'admin can read own import_jobs'
);

-- 16. Sales rep cannot read import_jobs created by another user
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.import_jobs WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'sales rep cannot read import_jobs created by admin'
);

-- 17. Admin can see all import_jobs (including own)
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT COUNT(*) FROM public.import_jobs WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  1::bigint,
  'admin can see all import_jobs'
);

-- 18. Sales rep cannot update import_jobs (not service_role)
-- The rep cannot see the admin-owned row (see test 16), so the UPDATE matches
-- zero rows.  Verify the row is unchanged as admin, who can read it.
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.import_jobs SET status = 'running' WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT status FROM public.import_jobs WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'pending',
  'sales rep cannot update import_jobs (silently blocked)'
);

-- 19. Admin cannot update import_jobs (not service_role)
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.import_jobs SET status = 'running' WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT status FROM public.import_jobs WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'pending',
  'admin cannot update import_jobs (silently blocked)'
);

-- 20. Sales rep cannot delete import_jobs
-- The rep cannot see the admin-owned row, so the DELETE matches zero rows.
-- Verify the row still exists as admin, who can read it.
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.import_jobs WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.import_jobs WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'sales rep cannot delete import_jobs (silently blocked)'
);

-- 21. Admin cannot delete import_jobs (no DELETE policy)
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.import_jobs WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT isnt_empty(
  $$SELECT id FROM public.import_jobs WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'admin cannot delete import_jobs (silently blocked)'
);

-- 22. import_jobs kind CHECK constraint is enforced
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.import_jobs (id, kind, target_entity_type, created_by) VALUES (gen_random_uuid(), 'bogus', 'accounts', '22222222-2222-2222-2222-222222222222')$$,
  '23514',
  NULL,
  'import_jobs kind CHECK rejects invalid values'
);

-- 23. import_jobs status CHECK constraint is enforced
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.import_jobs (id, kind, target_entity_type, status, created_by) VALUES (gen_random_uuid(), 'export', 'accounts', 'bogus', '22222222-2222-2222-2222-222222222222')$$,
  '23514',
  NULL,
  'import_jobs status CHECK rejects invalid values'
);

-- ============================================================================
-- SERVICE_ROLE TESTS — ORR-583
-- ============================================================================
-- Tests that service_role policies grant the expected access:
--   • finance_export_config_service_role — full access
--   • import_jobs_update_service_role   — UPDATE
--   • import_jobs_service_role_all      — full access

-- 24. service_role can SELECT finance_export_config
SELECT tests.as_service_role();
SET LOCAL ROLE service_role;
SELECT is(
  (SELECT COUNT(*) FROM public.finance_export_config),
  2::bigint,
  'service_role can SELECT finance_export_config'
);

-- 25. service_role can INSERT finance_export_config
-- Entities 'eeee...' and 'ffff...' already have config rows and the table has a
-- UNIQUE(entity_id) constraint, so this row targets the dedicated third entity
-- with its own unique id.
SELECT tests.as_service_role();
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$INSERT INTO public.finance_export_config (id, entity_id, destination_drive_folder_id) VALUES ('a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5', 'abababab-abab-abab-abab-abababababab', 'folder_service_role_001')$$,
  'service_role can INSERT finance_export_config'
);

-- 26. service_role can UPDATE finance_export_config
SELECT tests.as_service_role();
SET LOCAL ROLE service_role;
UPDATE public.finance_export_config SET destination_drive_folder_id = 'folder_service_role_updated' WHERE id = 'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5';
SELECT is(
  (SELECT destination_drive_folder_id FROM public.finance_export_config WHERE id = 'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5'),
  'folder_service_role_updated',
  'service_role can UPDATE finance_export_config'
);

-- 27. service_role can DELETE finance_export_config
SELECT tests.as_service_role();
SET LOCAL ROLE service_role;
DELETE FROM public.finance_export_config WHERE id = 'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5';
SELECT is_empty(
  $$SELECT id FROM public.finance_export_config WHERE id = 'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5'$$,
  'service_role can DELETE finance_export_config'
);

-- 28. service_role can SELECT import_jobs (bypasses created_by restriction)
SELECT tests.as_service_role();
SET LOCAL ROLE service_role;
SELECT is(
  (SELECT COUNT(*) FROM public.import_jobs),
  1::bigint,
  'service_role can SELECT all import_jobs'
);

-- 29. service_role can INSERT import_jobs
SELECT tests.as_service_role();
SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$INSERT INTO public.import_jobs (id, entity_id, kind, target_entity_type, status, created_by) VALUES ('aaaaaa02-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'export', 'accounts', 'pending', '33333333-3333-3333-3333-333333333333')$$,
  'service_role can INSERT import_jobs'
);

-- 30. service_role can UPDATE import_jobs (admin/rep cannot)
SELECT tests.as_service_role();
SET LOCAL ROLE service_role;
UPDATE public.import_jobs SET status = 'completed' WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT status FROM public.import_jobs WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'completed',
  'service_role can UPDATE import_jobs'
);

-- 31. service_role can DELETE import_jobs (admin/rep cannot)
SELECT tests.as_service_role();
SET LOCAL ROLE service_role;
DELETE FROM public.import_jobs WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is_empty(
  $$SELECT id FROM public.import_jobs WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'service_role can DELETE import_jobs'
);

-- 32. service_role can see import_jobs created by another user
SELECT tests.as_service_role();
SET LOCAL ROLE service_role;
SELECT is(
  (SELECT COUNT(*) FROM public.import_jobs),
  1::bigint,
  'service_role can see import_jobs created by another user'
);

SELECT * FROM finish();

ROLLBACK;
