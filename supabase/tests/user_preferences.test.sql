-- supabase/tests/user_preferences.test.sql
-- pgTAP tests for user_preferences owner-only RLS + constraints (ORR-615).
--
-- Run with: supabase test db

BEGIN;

SELECT plan(14);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com',  '{"full_name":"Admin User"}'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com',  '{"full_name":"Other Rep"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   'Sales Rep',  'sales_rep'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com',  'Admin User', 'admin'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com',  'Other Rep',  'sales_rep')
ON CONFLICT (id) DO UPDATE SET
  full_name    = EXCLUDED.full_name,
  primary_role = EXCLUDED.primary_role;

-- Seed a preferences row for the "other" user as service role (bypass RLS).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.user_preferences (id, user_id, display_currency, theme)
VALUES ('ffff0001-0001-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333', 'USD', 'dark');

-- ═══════════════════════════════════════════════════════════════════════════════
-- Owner-only RLS
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. User can INSERT own preferences
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.user_preferences (id, user_id, display_currency, entry_currency_default, theme)
    VALUES ('ffff0002-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111', 'USD', NULL, 'system')$$,
  'user can INSERT own preferences'
);

-- 2. User can SELECT own preferences
SELECT is_empty(
  $$SELECT id FROM public.user_preferences WHERE user_id = '33333333-3333-3333-3333-333333333333'$$,
  'user cannot SELECT another user preferences'
);

-- 3. User sees own row
SELECT isnt_empty(
  $$SELECT id FROM public.user_preferences WHERE user_id = '11111111-1111-1111-1111-111111111111'$$,
  'user can SELECT own preferences'
);

-- 4. Admin can SELECT all preferences
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.user_preferences),
  2,
  'admin can SELECT all preferences'
);

-- 5. Non-admin cannot INSERT preferences for another user
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.user_preferences (id, user_id, theme)
    VALUES ('ffff0003-0003-0003-0003-000000000003', '33333333-3333-3333-3333-333333333333', 'light')$$,
  '42501',
  NULL,
  'non-admin cannot INSERT preferences for another user'
);

-- 6. User can UPDATE own preferences
UPDATE public.user_preferences SET display_currency = 'INR'
  WHERE id = 'ffff0002-0002-0002-0002-000000000002';
SELECT is(
  (SELECT display_currency FROM public.user_preferences WHERE id = 'ffff0002-0002-0002-0002-000000000002'),
  'INR',
  'user can UPDATE own preferences'
);

-- 7. User cannot UPDATE another user's preferences (silently blocked)
UPDATE public.user_preferences SET theme = 'light'
  WHERE id = 'ffff0001-0001-0001-0001-000000000001';
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT theme FROM public.user_preferences WHERE id = 'ffff0001-0001-0001-0001-000000000001'),
  'dark',
  'user cannot UPDATE another user preferences (silently blocked)'
);

-- 8. Admin can UPDATE any preferences
UPDATE public.user_preferences SET theme = 'light'
  WHERE id = 'ffff0001-0001-0001-0001-000000000001';
SELECT is(
  (SELECT theme FROM public.user_preferences WHERE id = 'ffff0001-0001-0001-0001-000000000001'),
  'light',
  'admin can UPDATE any preferences'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Constraints
-- ═══════════════════════════════════════════════════════════════════════════════

-- 9. Invalid theme rejected (CHECK)
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$UPDATE public.user_preferences SET theme = 'neon' WHERE id = 'ffff0002-0002-0002-0002-000000000002'$$,
  '23514',
  NULL,
  'invalid theme rejected by CHECK constraint'
);

-- 10. Invalid currency rejected (FK)
SELECT throws_ok(
  $$UPDATE public.user_preferences SET display_currency = 'ZZZ' WHERE id = 'ffff0002-0002-0002-0002-000000000002'$$,
  '23503',
  NULL,
  'unknown display_currency rejected by FK to currencies'
);

-- 11. Invalid number_format rejected (CHECK)
SELECT throws_ok(
  $$UPDATE public.user_preferences SET number_format = 'martian' WHERE id = 'ffff0002-0002-0002-0002-000000000002'$$,
  '23514',
  NULL,
  'invalid number_format rejected by CHECK constraint'
);

-- 12. Duplicate preferences row for same user rejected (UNIQUE user_id)
SELECT throws_ok(
  $$INSERT INTO public.user_preferences (id, user_id, theme)
    VALUES ('ffff0004-0004-0004-0004-000000000004', '11111111-1111-1111-1111-111111111111', 'dark')$$,
  '23505',
  NULL,
  'second preferences row for the same user rejected by UNIQUE'
);

-- 13. User can DELETE own preferences
SELECT lives_ok(
  $$DELETE FROM public.user_preferences WHERE id = 'ffff0002-0002-0002-0002-000000000002'$$,
  'user can DELETE own preferences'
);

-- 14. User cannot DELETE another user's preferences (silently blocked)
DELETE FROM public.user_preferences WHERE id = 'ffff0001-0001-0001-0001-000000000001';
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.user_preferences WHERE id = 'ffff0001-0001-0001-0001-000000000001'$$,
  'user cannot DELETE another user preferences (silently blocked)'
);

SELECT * FROM finish();

ROLLBACK;
