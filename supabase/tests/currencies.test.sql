-- supabase/tests/currencies.test.sql
-- pgTAP tests for public.currencies RLS policies (ORR-142).
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db
-- All changes are rolled back; nothing persists after the test run.

BEGIN;

SELECT plan(8);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin User"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', 'Sales Rep', 'sales_rep', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin User', 'admin', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT (id) DO UPDATE SET
  full_name          = EXCLUDED.full_name,
  primary_role       = EXCLUDED.primary_role,
  primary_entity_id  = EXCLUDED.primary_entity_id;

-- ── 1. Non-admin authenticated can read currencies ───────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT code FROM public.currencies WHERE code = 'USD'$$,
  'non-admin authenticated can read currencies'
);

-- ── 2. Anon cannot read currencies ───────────────────────────────────────────
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT code FROM public.currencies WHERE true$$,
  'anon cannot read currencies'
);

-- ── 3. Non-admin cannot insert currency ──────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.currencies (code, name, scale) VALUES ('NEW1', 'New Currency', 2)$$,
  '42501',
  NULL,
  'non-admin cannot insert currency'
);

-- ── 4. Non-admin cannot update currency ──────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.currencies SET name = 'Hacked' WHERE code = 'USD';
SELECT is(
  (SELECT name FROM public.currencies WHERE code = 'USD'),
  'US Dollar',
  'non-admin cannot update currency (silently blocked)'
);

-- ── 5. Non-admin cannot delete currency ──────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.currencies WHERE code = 'USD';
SELECT isnt_empty(
  $$SELECT code FROM public.currencies WHERE code = 'USD'$$,
  'non-admin cannot delete currency (silently blocked)'
);

-- ── 6. Admin can insert currency ─────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.currencies (code, name, scale) VALUES ('NEW2', 'Admin Currency', 2)$$,
  'admin can insert currency'
);

-- ── 7. Admin can update currency ─────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.currencies SET name = 'Updated US Dollar' WHERE code = 'USD';
SELECT is(
  (SELECT name FROM public.currencies WHERE code = 'USD'),
  'Updated US Dollar',
  'admin can update currency'
);

-- ── 8. Admin can delete currency ─────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.currencies WHERE code = 'NEW2'$$,
  'admin can delete currency'
);

SELECT * FROM finish();

ROLLBACK;
