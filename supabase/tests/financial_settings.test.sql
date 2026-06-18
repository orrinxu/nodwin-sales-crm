-- supabase/tests/financial_settings.test.sql
-- pgTAP tests for financial-settings RLS policies (ORR-515 / ORR-505-DB).
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Covers: reporting_currency_settings, fiscal_year_settings,
--         approval_thresholds, revenue_recognition_defaults.
--
-- Run with: supabase test db
-- All changes are rolled back; nothing persists after the test run.

BEGIN;

SELECT plan(20);

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

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: reporting_currency_settings
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Anon cannot read
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.reporting_currency_settings WHERE true$$,
  'anon cannot read reporting_currency_settings'
);

-- 2. Sales rep can read
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.reporting_currency_settings WHERE true$$,
  'sales rep can read reporting_currency_settings (empty, not blocked)'
);

-- 3. Sales rep cannot insert
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.reporting_currency_settings (id, currency_code, is_default) VALUES (gen_random_uuid(), 'INR', true)$$,
  '42501',
  NULL,
  'sales rep cannot insert reporting_currency_settings'
);

-- 4. Admin can insert
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.reporting_currency_settings (id, currency_code, is_default) VALUES ('aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'INR', true)$$,
  'admin can insert reporting_currency_settings'
);

-- 5. Admin can update
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.reporting_currency_settings SET is_default = false WHERE id = 'aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT is_default FROM public.reporting_currency_settings WHERE id = 'aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  false,
  'admin can update reporting_currency_settings'
);

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: fiscal_year_settings
-- ────────────────────────────────────────────────────────────────────────────

-- 6. Sales rep can read (table is empty, not blocked)
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.fiscal_year_settings WHERE true$$,
  'sales rep can read fiscal_year_settings (empty, not blocked)'
);

-- 7. Sales rep cannot insert
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.fiscal_year_settings (id, entity_id, fy_start_month) VALUES (gen_random_uuid(), 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 4)$$,
  '42501',
  NULL,
  'sales rep cannot insert fiscal_year_settings'
);

-- 8. Admin can insert
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.fiscal_year_settings (id, entity_id, fy_start_month) VALUES ('bbbb0002-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 4)$$,
  'admin can insert fiscal_year_settings'
);

-- 9. Admin can update
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.fiscal_year_settings SET fy_start_month = 7 WHERE id = 'bbbb0002-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT is(
  (SELECT fy_start_month FROM public.fiscal_year_settings WHERE id = 'bbbb0002-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  7,
  'admin can update fiscal_year_settings'
);

-- 10. Admin can delete
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.fiscal_year_settings WHERE id = 'bbbb0002-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'admin can delete fiscal_year_settings'
);

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: approval_thresholds
-- ────────────────────────────────────────────────────────────────────────────

-- 11. Sales rep cannot insert
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.approval_thresholds (id, entity_id, deal_value_threshold, approver_role) VALUES (gen_random_uuid(), 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 100000, 'admin')$$,
  '42501',
  NULL,
  'sales rep cannot insert approval_thresholds'
);

-- 12. Admin can insert
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.approval_thresholds (id, entity_id, deal_value_threshold, discount_threshold_pct, approver_role) VALUES ('cccc0003-cccc-cccc-cccc-cccccccccccc', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 100000, 20, 'admin')$$,
  'admin can insert approval_thresholds'
);

-- 13. Admin can update
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.approval_thresholds SET deal_value_threshold = 200000 WHERE id = 'cccc0003-cccc-cccc-cccc-cccccccccccc';
SELECT is(
  (SELECT deal_value_threshold FROM public.approval_thresholds WHERE id = 'cccc0003-cccc-cccc-cccc-cccccccccccc'),
  200000::numeric,
  'admin can update approval_thresholds'
);

-- 14. Sales rep can read
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.approval_thresholds WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'$$,
  'sales rep can read approval_thresholds'
);

-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: revenue_recognition_defaults
-- ────────────────────────────────────────────────────────────────────────────

-- 15. Sales rep cannot insert
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.revenue_recognition_defaults (id, entity_id, default_split_kind) VALUES (gen_random_uuid(), 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'equal_split')$$,
  '42501',
  NULL,
  'sales rep cannot insert revenue_recognition_defaults'
);

-- 16. Admin can insert
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.revenue_recognition_defaults (id, entity_id, default_split_kind, estimated_gross_margin_pct) VALUES ('dddd0004-dddd-dddd-dddd-dddddddddddd', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'equal_split', 40)$$,
  'admin can insert revenue_recognition_defaults'
);

-- 17. Admin can update
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.revenue_recognition_defaults SET estimated_gross_margin_pct = 45 WHERE id = 'dddd0004-dddd-dddd-dddd-dddddddddddd';
SELECT is(
  (SELECT estimated_gross_margin_pct FROM public.revenue_recognition_defaults WHERE id = 'dddd0004-dddd-dddd-dddd-dddddddddddd'),
  45::numeric,
  'admin can update revenue_recognition_defaults'
);

-- 18. Admin can delete
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.revenue_recognition_defaults WHERE id = 'dddd0004-dddd-dddd-dddd-dddddddddddd'$$,
  'admin can delete revenue_recognition_defaults'
);

-- ────────────────────────────────────────────────────────────────────────────
-- CONSTRAINTS
-- ────────────────────────────────────────────────────────────────────────────

-- 19. fiscal_year_settings: fy_start_month out of range
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.fiscal_year_settings (id, entity_id, fy_start_month) VALUES (gen_random_uuid(), 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 13)$$,
  '23514',
  NULL,
  'fy_start_month > 12 is rejected'
);
SELECT throws_ok(
  $$INSERT INTO public.fiscal_year_settings (id, entity_id, fy_start_month) VALUES (gen_random_uuid(), 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 0)$$,
  '23514',
  NULL,
  'fy_start_month < 1 is rejected'
);

-- 20. approval_thresholds: discount_threshold_pct out of range
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.approval_thresholds (id, entity_id, discount_threshold_pct, approver_role) VALUES (gen_random_uuid(), 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 101, 'admin')$$,
  '23514',
  NULL,
  'discount_threshold_pct > 100 is rejected'
);

SELECT * FROM finish();

ROLLBACK;
