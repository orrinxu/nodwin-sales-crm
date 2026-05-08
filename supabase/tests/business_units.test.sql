-- supabase/tests/business_units.test.sql
-- pgTAP tests for public.business_units table, RLS policies, and triggers.
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(9);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin User"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', 'Sales Rep', 'sales_rep'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin User', 'admin')
ON CONFLICT (id) DO UPDATE SET
  full_name    = EXCLUDED.full_name,
  primary_role = EXCLUDED.primary_role;

-- Insert prerequisite entity and the parent BU as admin (bypass RLS).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name, base_currency, fiscal_year_start_month)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'NG India', 'INR', 4);

INSERT INTO public.business_units (id, name, entity_id, kind, active)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'East Asia', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sales', true),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Inactive BU', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sales', true);

-- Soft-delete the second BU.
UPDATE public.business_units SET active = false WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

-- ── 1. Authenticated rep can read active business unit ───────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.business_units WHERE name = 'East Asia'$$,
  'rep can read active business unit'
);

-- ── 2. Authenticated rep can see inactive BU (soft-delete visible) ──────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.business_units WHERE name = 'Inactive BU'$$,
  'rep can still read soft-deleted business unit'
);

-- ── 3. Authenticated rep cannot insert business unit ────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.business_units (id, name, entity_id) VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Bad BU', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  '42501',
  NULL,
  'rep cannot insert business unit'
);

-- ── 4. Authenticated rep cannot update business unit ────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.business_units SET name = 'Hacked' WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT is(
  (SELECT name FROM public.business_units WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'East Asia',
  'rep cannot update business unit (silently blocked)'
);

-- ── 5. Authenticated rep cannot delete business unit ────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.business_units WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT isnt_empty(
  $$SELECT id FROM public.business_units WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'rep cannot delete business unit (silently blocked)'
);

-- ── 6. Admin can insert business unit ───────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.business_units (id, name, entity_id, kind) VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'New BU', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'revenue_recognition')$$,
  'admin can insert business unit'
);

-- ── 7. Admin can update business unit ───────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.business_units SET name = 'Updated East Asia' WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT is(
  (SELECT name FROM public.business_units WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'Updated East Asia',
  'admin can update business unit'
);

-- ── 8. Business unit hierarchical parent works ──────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
INSERT INTO public.business_units (id, name, entity_id, kind, parent_id)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Child BU', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'sales', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT parent_id::text FROM public.business_units WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'child BU references parent BU correctly'
);

-- ── 9. Audit log captures business unit changes ─────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_log WHERE table_name = 'business_units' AND row_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  '>=',
  1,
  'audit_log captured at least one business unit change for row'
);

SELECT * FROM finish();

ROLLBACK;
