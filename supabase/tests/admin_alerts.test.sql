-- supabase/tests/admin_alerts.test.sql
-- pgTAP tests for public.admin_alerts RLS policies.
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(12);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

-- Create auth users.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',  '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin User"}'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', '{"full_name":"Other User"}')
ON CONFLICT (id) DO NOTHING;

-- Upsert public.users rows with correct roles.
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',  'Sales Rep',  'sales_rep', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin User', 'admin',     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', 'Other User', 'sales_rep', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO UPDATE SET
  full_name          = EXCLUDED.full_name,
  primary_role       = EXCLUDED.primary_role,
  primary_entity_id  = EXCLUDED.primary_entity_id;

-- Insert a fixture alert as service role (bypasses RLS).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.admin_alerts (id, title, message, type, created_by)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Forged sender detected',
  'A forged sender email was detected and dead-lettered.',
  'deadletter',
  '22222222-2222-2222-2222-222222222222'
);

-- ── 1. Admin can SELECT admin_alerts ─────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.admin_alerts WHERE type = 'deadletter'$$,
  'admin can SELECT admin_alerts'
);

-- ── 2. Sales rep cannot SELECT admin_alerts ──────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.admin_alerts WHERE true$$,
  'sales rep cannot SELECT admin_alerts'
);

-- ── 3. Other sales rep cannot SELECT admin_alerts ────────────────────────────
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.admin_alerts WHERE true$$,
  'other sales rep cannot SELECT admin_alerts'
);

-- ── 4. Anonymous cannot SELECT admin_alerts ──────────────────────────────────
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.admin_alerts WHERE true$$,
  'anon cannot SELECT admin_alerts'
);

-- ── 5. Admin can INSERT admin_alerts ─────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.admin_alerts (id, title, message, type, created_by) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Test alert', 'Test message', 'info', '22222222-2222-2222-2222-222222222222')$$,
  'admin can INSERT admin_alerts'
);

-- ── 6. Sales rep cannot INSERT admin_alerts ──────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.admin_alerts (id, title, message, type, created_by) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Test alert', 'Test message', 'info', '11111111-1111-1111-1111-111111111111')$$,
  '42501',
  NULL,
  'sales rep cannot INSERT admin_alerts'
);

-- ── 7. Admin can UPDATE admin_alerts ─────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.admin_alerts SET acknowledged_at = NOW() WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT acknowledged_at IS NOT NULL FROM public.admin_alerts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  true,
  'admin can UPDATE admin_alerts'
);

-- ── 8. Sales rep cannot UPDATE admin_alerts ──────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.admin_alerts SET title = 'Hacked' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- Verify as admin that the row is unchanged.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT title FROM public.admin_alerts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Forged sender detected',
  'sales rep cannot UPDATE admin_alerts (silently blocked)'
);

-- ── 9. Admin can DELETE admin_alerts ─────────────────────────────────────────
-- Delete the alert inserted in test 5.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.admin_alerts WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'admin can DELETE admin_alerts'
);

-- ── 10. Sales rep cannot DELETE admin_alerts ─────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.admin_alerts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
-- Verify as admin that the row still exists.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.admin_alerts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'sales rep cannot DELETE admin_alerts (silently blocked)'
);

-- ── 11. Audit log captures admin_alerts changes ──────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_log WHERE table_name = 'admin_alerts' AND row_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '>=',
  1,
  'audit_log captured at least one admin_alerts change for row'
);

-- ── 12. acknowledged_at partial index exists ─────────────────────────────────
SELECT has_index(
  'public',
  'admin_alerts',
  'idx_admin_alerts_acknowledged_at',
  ARRAY['acknowledged_at'],
  'acknowledged_at partial index exists'
);

SELECT * FROM finish();

ROLLBACK;
