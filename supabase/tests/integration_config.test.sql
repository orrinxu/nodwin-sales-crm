-- supabase/tests/integration_config.test.sql
-- pgTAP tests for integration config RLS policies (ORR-518 / ORR-506-db).
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Covers: integration_settings, slack_connections, email_settings,
--         salesforce_connections, plus drive_config Google Workspace columns.
--
-- Run with: supabase test db
-- All changes are rolled back; nothing persists after the test run.

BEGIN;

SELECT plan(27);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com',  '{"full_name":"Admin User"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.entities (id, name, base_currency)
VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Test Entity', 'USD')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',  'Sales Rep',  'sales_rep', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin User', 'admin',     'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')
ON CONFLICT (id) DO UPDATE SET
  full_name          = EXCLUDED.full_name,
  primary_role       = EXCLUDED.primary_role,
  primary_entity_id  = EXCLUDED.primary_entity_id;

-- Seed drive_config so Google Workspace column tests have a row.
INSERT INTO public.drive_config (id, entity_id, accounts_parent_folder_id)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'folder_accts_001')
ON CONFLICT (entity_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: integration_settings
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Anon cannot read
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.integration_settings WHERE true$$,
  'anon cannot read integration_settings'
);

-- 2. Sales rep can read (empty table, not blocked)
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.integration_settings WHERE true$$,
  'sales rep can read integration_settings (empty, not blocked)'
);

-- 3. Sales rep cannot insert
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.integration_settings (id, key, value) VALUES (gen_random_uuid(), 'test.toggle', 'true')$$,
  '42501',
  NULL,
  'sales rep cannot insert integration_settings'
);

-- 4. Admin can insert
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.integration_settings (id, key, value) VALUES ('aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'slack.enabled', 'true')$$,
  'admin can insert integration_settings'
);

-- 5. Admin can update
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.integration_settings SET value = 'false' WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT value FROM public.integration_settings WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'false'::jsonb,
  'admin can update integration_settings'
);

-- 6. Admin can delete
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.integration_settings WHERE id = 'aaaaaa01-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'admin can delete integration_settings'
);

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: slack_connections
-- ────────────────────────────────────────────────────────────────────────────

-- 7. Anon cannot read
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.slack_connections WHERE true$$,
  'anon cannot read slack_connections'
);

-- 8. Sales rep can read (empty, not blocked)
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.slack_connections WHERE true$$,
  'sales rep can read slack_connections (empty, not blocked)'
);

-- 9. Sales rep cannot insert
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.slack_connections (id, workspace_id, workspace_name) VALUES (gen_random_uuid(), 'T001', 'Test Workspace')$$,
  '42501',
  NULL,
  'sales rep cannot insert slack_connections'
);

-- 10. Admin can insert
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.slack_connections (id, workspace_id, workspace_name, event_routing) VALUES ('bbbbbb02-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'T001', 'Test Workspace', '{"events":["message.channels"]}')$$,
  'admin can insert slack_connections'
);

-- 11. Admin can update status
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.slack_connections SET status = 'connected' WHERE id = 'bbbbbb02-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT is(
  (SELECT status FROM public.slack_connections WHERE id = 'bbbbbb02-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'connected',
  'admin can update slack_connections'
);

-- 12. Sales rep cannot update (verify as service role — rep can't read it, ORR-696)
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.slack_connections SET status = 'error' WHERE id = 'bbbbbb02-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status FROM public.slack_connections WHERE id = 'bbbbbb02-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'connected',
  'sales rep cannot update slack_connections (silently blocked)'
);

-- 13. Sales rep cannot delete (verify as service role)
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.slack_connections WHERE id = 'bbbbbb02-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT isnt_empty(
  $$SELECT id FROM public.slack_connections WHERE id = 'bbbbbb02-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'sales rep cannot delete slack_connections (silently blocked)'
);

-- 14. Admin can delete
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.slack_connections WHERE id = 'bbbbbb02-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'admin can delete slack_connections'
);

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: email_settings
-- ────────────────────────────────────────────────────────────────────────────

-- 15. Sales rep cannot insert
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.email_settings (id, resend_domain) VALUES (gen_random_uuid(), 'crm.nodwin.com')$$,
  '42501',
  NULL,
  'sales rep cannot insert email_settings'
);

-- 16. Admin can insert
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.email_settings (id, resend_domain, inbound_domain, status) VALUES ('cccccc03-cccc-cccc-cccc-cccccccccccc', 'crm.nodwin.com', 'inbound.nodwin.com', 'active')$$,
  'admin can insert email_settings'
);

-- 17. Admin can update
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.email_settings SET status = 'inactive' WHERE id = 'cccccc03-cccc-cccc-cccc-cccccccccccc';
SELECT is(
  (SELECT status FROM public.email_settings WHERE id = 'cccccc03-cccc-cccc-cccc-cccccccccccc'),
  'inactive',
  'admin can update email_settings'
);

-- 18. Sales rep CANNOT read (admin-only, ORR-696)
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.email_settings WHERE resend_domain = 'crm.nodwin.com'$$,
  'sales rep cannot read email_settings (admin-only)'
);

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: salesforce_connections
-- ────────────────────────────────────────────────────────────────────────────

-- 19. Sales rep cannot insert
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.salesforce_connections (id, instance_url) VALUES (gen_random_uuid(), 'https://nodwin.my.salesforce.com')$$,
  '42501',
  NULL,
  'sales rep cannot insert salesforce_connections'
);

-- 20. Admin can insert
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.salesforce_connections (id, instance_url, import_status, last_sync_at) VALUES ('dddddd04-dddd-dddd-dddd-dddddddddddd', 'https://nodwin.my.salesforce.com', 'connected', now())$$,
  'admin can insert salesforce_connections'
);

-- 21. Admin can update import_status
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.salesforce_connections SET import_status = 'importing' WHERE id = 'dddddd04-dddd-dddd-dddd-dddddddddddd';
SELECT is(
  (SELECT import_status FROM public.salesforce_connections WHERE id = 'dddddd04-dddd-dddd-dddd-dddddddddddd'),
  'importing',
  'admin can update salesforce_connections'
);

-- 22. Sales rep CANNOT read (admin-only, ORR-696)
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.salesforce_connections WHERE instance_url = 'https://nodwin.my.salesforce.com'$$,
  'sales rep cannot read salesforce_connections (admin-only)'
);

-- ────────────────────────────────────────────────────────────────────────────
-- Google Workspace columns on drive_config
-- ────────────────────────────────────────────────────────────────────────────

-- 23. Admin can update Google Workspace toggles
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.drive_config
SET gmail_sync_enabled = true, sheets_access_enabled = true
WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT is(
  (SELECT gmail_sync_enabled FROM public.drive_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  true,
  'admin can set gmail_sync_enabled on drive_config'
);

-- 24. New columns default to false
SELECT is(
  (SELECT docs_access_enabled FROM public.drive_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  false,
  'docs_access_enabled defaults to false'
);
SELECT is(
  (SELECT slides_access_enabled FROM public.drive_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  false,
  'slides_access_enabled defaults to false'
);

-- 25. Sales rep cannot update Google Workspace toggles (verify as service role)
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.drive_config
SET gmail_sync_enabled = false, sheets_access_enabled = false
WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT gmail_sync_enabled FROM public.drive_config WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  true,
  'sales rep cannot change gmail_sync_enabled (silently blocked)'
);

-- 26. Status CHECK constraints are enforced
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.slack_connections (id, workspace_id, status) VALUES (gen_random_uuid(), 'T002', 'bogus_status')$$,
  '23514',
  NULL,
  'slack_connections status CHECK rejects invalid values'
);

SELECT * FROM finish();

ROLLBACK;
