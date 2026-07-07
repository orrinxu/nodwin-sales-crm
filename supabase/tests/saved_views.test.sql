-- supabase/tests/saved_views.test.sql
-- pgTAP tests for saved_views owner-only RLS + constraints.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(13);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'sv-rep@nodwin.com',   '{"full_name":"SV Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'sv-admin@nodwin.com', '{"full_name":"SV Admin"}'),
  ('33333333-3333-3333-3333-333333333333', 'sv-other@nodwin.com', '{"full_name":"SV Other"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'sv-rep@nodwin.com',   'SV Rep',   'sales_rep'),
  ('22222222-2222-2222-2222-222222222222', 'sv-admin@nodwin.com', 'SV Admin', 'admin'),
  ('33333333-3333-3333-3333-333333333333', 'sv-other@nodwin.com', 'SV Other', 'sales_rep')
ON CONFLICT (id) DO UPDATE SET
  full_name    = EXCLUDED.full_name,
  primary_role = EXCLUDED.primary_role;

-- Seed a view for the "other" user as service role (bypass RLS).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.saved_views (id, user_id, name, scope, filters)
VALUES ('ffff0001-0001-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333',
        'Other view', 'all', '{"stageFilter":"propose"}'::jsonb);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Owner-only RLS
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. User can INSERT own view
SELECT tests.as_user('sv-rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.saved_views (id, user_id, name, scope, filters)
    VALUES ('ffff0002-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111',
            'My hot deals', 'mine', '{"stageFilter":"negotiate","ownerFilter":"all"}'::jsonb)$$,
  'user can INSERT own saved view'
);

-- 2. User cannot SELECT another user's view
SELECT is_empty(
  $$SELECT id FROM public.saved_views WHERE user_id = '33333333-3333-3333-3333-333333333333'$$,
  'user cannot SELECT another user saved view'
);

-- 3. User sees own view
SELECT isnt_empty(
  $$SELECT id FROM public.saved_views WHERE user_id = '11111111-1111-1111-1111-111111111111'$$,
  'user can SELECT own saved view'
);

-- 4. Admin can SELECT all views
SELECT tests.as_user('sv-admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT count(*)::int FROM public.saved_views),
  2,
  'admin can SELECT all saved views'
);

-- 5. Non-admin cannot INSERT a view for another user
SELECT tests.as_user('sv-rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.saved_views (id, user_id, name, scope)
    VALUES ('ffff0003-0003-0003-0003-000000000003', '33333333-3333-3333-3333-333333333333', 'Sneaky', 'all')$$,
  '42501',
  NULL,
  'non-admin cannot INSERT a saved view for another user'
);

-- 6. User can UPDATE own view
UPDATE public.saved_views SET filters = '{"stageFilter":"propose"}'::jsonb
  WHERE id = 'ffff0002-0002-0002-0002-000000000002';
SELECT is(
  (SELECT filters->>'stageFilter' FROM public.saved_views WHERE id = 'ffff0002-0002-0002-0002-000000000002'),
  'propose',
  'user can UPDATE own saved view'
);

-- 7. User cannot UPDATE another user's view (silently blocked)
UPDATE public.saved_views SET name = 'Hijacked'
  WHERE id = 'ffff0001-0001-0001-0001-000000000001';
SELECT tests.as_user('sv-admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT name FROM public.saved_views WHERE id = 'ffff0001-0001-0001-0001-000000000001'),
  'Other view',
  'user cannot UPDATE another user saved view (silently blocked)'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Constraints
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('sv-rep@nodwin.com');
SET LOCAL ROLE authenticated;

-- 8. Duplicate (user_id, scope, name) rejected (UNIQUE)
SELECT throws_ok(
  $$INSERT INTO public.saved_views (id, user_id, name, scope)
    VALUES ('ffff0004-0004-0004-0004-000000000004', '11111111-1111-1111-1111-111111111111', 'My hot deals', 'mine')$$,
  '23505',
  NULL,
  'duplicate (user, scope, name) saved view rejected by UNIQUE'
);

-- 9. Same name under a DIFFERENT scope is allowed
SELECT lives_ok(
  $$INSERT INTO public.saved_views (id, user_id, name, scope)
    VALUES ('ffff0005-0005-0005-0005-000000000005', '11111111-1111-1111-1111-111111111111', 'My hot deals', 'all')$$,
  'same name under a different scope is allowed'
);

-- 10. Invalid scope rejected (CHECK)
SELECT throws_ok(
  $$INSERT INTO public.saved_views (id, user_id, name, scope)
    VALUES ('ffff0006-0006-0006-0006-000000000006', '11111111-1111-1111-1111-111111111111', 'Bad scope', 'everything')$$,
  '23514',
  NULL,
  'invalid scope rejected by CHECK constraint'
);

-- 11. Empty name rejected (CHECK length)
SELECT throws_ok(
  $$INSERT INTO public.saved_views (id, user_id, name, scope)
    VALUES ('ffff0007-0007-0007-0007-000000000007', '11111111-1111-1111-1111-111111111111', '', 'mine')$$,
  '23514',
  NULL,
  'empty name rejected by CHECK length constraint'
);

-- 12. User can DELETE own view
SELECT lives_ok(
  $$DELETE FROM public.saved_views WHERE id = 'ffff0002-0002-0002-0002-000000000002'$$,
  'user can DELETE own saved view'
);

-- 13. User cannot DELETE another user's view (silently blocked)
DELETE FROM public.saved_views WHERE id = 'ffff0001-0001-0001-0001-000000000001';
SELECT tests.as_user('sv-admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.saved_views WHERE id = 'ffff0001-0001-0001-0001-000000000001'$$,
  'user cannot DELETE another user saved view (silently blocked)'
);

SELECT * FROM finish();

ROLLBACK;
