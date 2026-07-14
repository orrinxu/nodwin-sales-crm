-- supabase/tests/drive_config.test.sql
-- pgTAP tests for public.drive_config RLS policies (ORR-311 / T-034).
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db
-- All changes are rolled back; nothing persists after the test run.

BEGIN;

SELECT plan(8);

-- ── Fixtures ─────────────────────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin User"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.entities (id, name, base_currency)
VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Test Entity', 'USD'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Second Entity', 'USD')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', 'Sales Rep', 'sales_rep', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin User', 'admin', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')
ON CONFLICT (id) DO UPDATE SET
  full_name          = EXCLUDED.full_name,
  primary_role       = EXCLUDED.primary_role,
  primary_entity_id  = EXCLUDED.primary_entity_id;

-- Seed one config row so read tests have data.
INSERT INTO public.drive_config (id, entity_id, accounts_parent_folder_id, opportunities_parent_folder_id)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'folder_accts_001', 'folder_opps_001')
ON CONFLICT (entity_id) DO NOTHING;

-- ── 1. Non-admin authenticated CANNOT read drive_config (admin-only, ORR-696) ─────────────────

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT entity_id FROM public.drive_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'$$,
  'non-admin authenticated cannot read drive_config (admin-only)'
);

-- ── 2. Anon cannot read drive_config ─────────────────────────────────────────────────────────

SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT entity_id FROM public.drive_config WHERE true$$,
  'anon cannot read drive_config'
);

-- ── 3. Non-admin cannot insert drive_config ───────────────────────────────────────────────────

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.drive_config (entity_id, accounts_parent_folder_id)
    VALUES (gen_random_uuid(), 'folder_evil')$$,
  '42501',
  NULL,
  'non-admin cannot insert drive_config'
);

-- ── 4. Non-admin cannot update drive_config ───────────────────────────────────────────────────

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.drive_config SET accounts_parent_folder_id = 'hacked' WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
-- Verify as service role: the rep can no longer read the row to confirm it itself.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT accounts_parent_folder_id FROM public.drive_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'folder_accts_001',
  'non-admin cannot update drive_config (silently blocked)'
);

-- ── 5. Non-admin cannot delete drive_config ───────────────────────────────────────────────────

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.drive_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT isnt_empty(
  $$SELECT entity_id FROM public.drive_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'$$,
  'non-admin cannot delete drive_config (silently blocked)'
);

-- ── 6. Admin can insert drive_config ─────────────────────────────────────────────────────────

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.drive_config (entity_id, accounts_parent_folder_id, opportunities_parent_folder_id)
    VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'folder_accts_new', 'folder_opps_new')$$,
  'admin can insert drive_config'
);

-- ── 7. Admin can update drive_config ─────────────────────────────────────────────────────────

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.drive_config SET accounts_parent_folder_id = 'folder_accts_updated' WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT is(
  (SELECT accounts_parent_folder_id FROM public.drive_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'folder_accts_updated',
  'admin can update drive_config'
);

-- ── 8. Admin can delete drive_config ─────────────────────────────────────────────────────────

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.drive_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'$$,
  'admin can delete drive_config'
);

SELECT * FROM finish();

ROLLBACK;
