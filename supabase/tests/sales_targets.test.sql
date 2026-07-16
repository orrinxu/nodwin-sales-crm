-- supabase/tests/sales_targets.test.sql
-- pgTAP for sales_targets (ORR-726): RLS (own read / admin write) + the unique
-- (user, year, quarter) + amount CHECK. HIGH-RISK FILE -- see AGENTS.md §6.

BEGIN;

SELECT plan(8);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   '{"full_name":"Rep"}'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', '{"full_name":"Other"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   'Rep',   'sales_rep', NULL),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', 'Other', 'sales_rep', NULL),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin', 'admin',     NULL)
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.sales_targets (user_id, year, quarter, target_amount, currency)
VALUES ('11111111-1111-1111-1111-111111111111', 2026, 3, 100000, 'USD');

-- 1. RLS enabled
SELECT has_rls('public', 'sales_targets', 'sales_targets has RLS');

-- 2. A rep reads their own target
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.sales_targets WHERE user_id = '11111111-1111-1111-1111-111111111111'$$,
  'rep reads own target');

-- 3. A different rep cannot read someone else's target
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.sales_targets WHERE user_id = '11111111-1111-1111-1111-111111111111'$$,
  'a rep cannot read another rep''s target');

-- 4. Admin reads any target
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.sales_targets WHERE user_id = '11111111-1111-1111-1111-111111111111'$$,
  'admin reads any target');

-- 5. A rep cannot set targets
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.sales_targets (user_id, year, quarter, target_amount)
    VALUES ('11111111-1111-1111-1111-111111111111', 2026, 4, 50000)$$,
  '42501', NULL, 'a rep cannot set targets');

-- 6. Admin can set a target
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.sales_targets (user_id, year, quarter, target_amount)
    VALUES ('33333333-3333-3333-3333-333333333333', 2026, 3, 75000)$$,
  'admin can set a target');

-- 7. Duplicate (user, year, quarter) is rejected
SELECT throws_ok(
  $$INSERT INTO public.sales_targets (user_id, year, quarter, target_amount)
    VALUES ('11111111-1111-1111-1111-111111111111', 2026, 3, 1)$$,
  '23505', NULL, 'one target per rep per quarter');

-- 8. A negative target is rejected
SELECT throws_ok(
  $$INSERT INTO public.sales_targets (user_id, year, quarter, target_amount)
    VALUES ('22222222-2222-2222-2222-222222222222', 2026, 3, -1)$$,
  '23514', NULL, 'a negative target is rejected');

SELECT * FROM finish();

ROLLBACK;
