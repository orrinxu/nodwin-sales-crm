-- supabase/tests/users.test.sql
-- pgTAP tests for public.users table, RLS policies, and triggers.
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(14);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

-- Create auth users first (required by FK).
-- Also pre-create auth users for insert tests (12, 13) so those tests
-- can focus on RLS rather than FK violations.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin User"}'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', '{"full_name":"Other Rep"}'),
  ('44444444-4444-4444-4444-444444444444', 'new@nodwin.com', '{"full_name":"New User"}'),
  ('55555555-5555-5555-5555-555555555555', 'bad@nodwin.com', '{"full_name":"Bad User"}')
ON CONFLICT (id) DO NOTHING;

-- The auth trigger on auth.users insert already created public.users rows
-- with defaults.  Upsert to set the correct role and entity_id for testing.
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', 'Sales Rep', 'sales_rep', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin User', 'admin', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', 'Other Rep', 'sales_rep', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO UPDATE SET
  full_name          = EXCLUDED.full_name,
  primary_role       = EXCLUDED.primary_role,
  primary_entity_id  = EXCLUDED.primary_entity_id;

-- ── 1. crm_inbound_email is generated automatically ───────────────────────────
SELECT matches(
  (SELECT crm_inbound_email FROM public.users WHERE id = '11111111-1111-1111-1111-111111111111'),
  '.*@crm\.nodwin\.com$',
  'crm_inbound_email is auto-generated with @crm.nodwin.com suffix'
);

-- ── 2. crm_inbound_email is unique ───────────────────────────────────────────
SELECT is(
  (SELECT count(DISTINCT crm_inbound_email) FROM public.users),
  (SELECT count(*) FROM public.users),
  'all crm_inbound_email values are unique'
);

-- ── 3. User can read own record ──────────────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.users WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  'rep can read own record'
);

-- ── 4. User can read same-entity users ───────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.users WHERE id = '22222222-2222-2222-2222-222222222222'$$,
  'rep can read same-entity admin record'
);

-- ── 5. User cannot read different-entity users ───────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.users WHERE id = '33333333-3333-3333-3333-333333333333'$$,
  'rep cannot read different-entity user'
);

-- ── 6. Admin can read all users ──────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.users WHERE id = '33333333-3333-3333-3333-333333333333'$$,
  'admin can read different-entity user'
);

-- ── 7. Anon cannot read any users ────────────────────────────────────────────
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.users WHERE true$$,
  'anon cannot read any users'
);

-- ── 8. User can update own non-admin fields ──────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.users
SET full_name = 'Updated Rep Name'
WHERE id = '11111111-1111-1111-1111-111111111111';
SELECT is(
  (SELECT full_name FROM public.users WHERE id = '11111111-1111-1111-1111-111111111111'),
  'Updated Rep Name',
  'rep can update own full_name'
);

-- ── 9. User cannot escalate own role ─────────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$UPDATE public.users SET primary_role = 'admin' WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  'Only admins can change primary_role',
  'rep cannot escalate own role to admin'
);

-- ── 10. User cannot change own manager ───────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$UPDATE public.users SET manager_user_id = '22222222-2222-2222-2222-222222222222' WHERE id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  'Only admins can change manager_user_id',
  'rep cannot change own manager'
);

-- ── 11. Admin can update role ────────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.users
SET primary_role = 'sales_manager'
WHERE id = '11111111-1111-1111-1111-111111111111';
SELECT is(
  (SELECT primary_role FROM public.users WHERE id = '11111111-1111-1111-1111-111111111111'),
  'sales_manager',
  'admin can update user role'
);

-- ── 12. Admin can insert new user ────────────────────────────────────────────
-- Remove the auto-created row so we can test the admin INSERT explicitly.
DELETE FROM public.users WHERE id = '44444444-4444-4444-4444-444444444444';

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.users (id, email, full_name, primary_role) VALUES ('44444444-4444-4444-4444-444444444444', 'new@nodwin.com', 'New User', 'sales_rep')$$,
  'admin can insert new user'
);

-- ── 13. Non-admin cannot insert user ─────────────────────────────────────────
-- Remove the auto-created row so RLS (not FK) is the gate being tested.
DELETE FROM public.users WHERE id = '55555555-5555-5555-5555-555555555555';

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.users (id, email, full_name, primary_role) VALUES ('55555555-5555-5555-5555-555555555555', 'bad@nodwin.com', 'Bad User', 'sales_rep')$$,
  '42501',
  NULL,
  'rep cannot insert new user'
);

-- ── 14. Audit log captures user changes ──────────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_log WHERE table_name = 'users' AND row_id = '11111111-1111-1111-1111-111111111111'),
  '>=',
  1,
  'audit_log captured at least one user change for row'
);

SELECT * FROM finish();

ROLLBACK;
