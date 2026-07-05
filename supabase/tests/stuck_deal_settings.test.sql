-- supabase/tests/stuck_deal_settings.test.sql
-- pgTAP for public.stuck_deal_settings RLS (ORR-103): thresholds are admin-only.

BEGIN;

SELECT plan(5);

INSERT INTO auth.users (id, email) VALUES
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com'),
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin', 'admin',     NULL),
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   'Rep',   'sales_rep', NULL)
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

-- Seeded by the migration: 5 open-stage rows.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT results_eq(
  $$ SELECT count(*)::int FROM public.stuck_deal_settings $$,
  $$ VALUES (5) $$,
  'admin sees all five seeded open-stage thresholds');

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty($$ SELECT stage FROM public.stuck_deal_settings $$,
  'non-admin cannot read thresholds');
SELECT is_empty(
  $$ UPDATE public.stuck_deal_settings SET threshold_days = 1 WHERE stage = 'qualify' RETURNING stage $$,
  'non-admin update affects no rows (RLS blocks it)');

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ UPDATE public.stuck_deal_settings SET threshold_days = 30 WHERE stage = 'qualify' $$,
  'admin can update a threshold');

-- CHECK constraint guards the range (0 < days <= 365).
SELECT throws_ok(
  $$ UPDATE public.stuck_deal_settings SET threshold_days = 0 WHERE stage = 'qualify' $$,
  '23514',
  NULL,
  'threshold_days must be positive (CHECK constraint)');

SELECT * FROM finish();
ROLLBACK;
