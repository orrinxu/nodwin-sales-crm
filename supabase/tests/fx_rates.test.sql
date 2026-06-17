-- supabase/tests/fx_rates.test.sql
-- pgTAP tests for public.fx_rates RLS policies (ORR-458 / FX-1).
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db
-- All changes are rolled back; nothing persists after the test run.

BEGIN;

SELECT plan(12);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com',  '{"full_name":"Admin User"}'),
  ('33333333-3333-3333-3333-333333333333', 'finance@nodwin.com','{"full_name":"Finance User"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.entities (id, name, base_currency)
VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Test Entity', 'USD')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',    'Sales Rep',    'sales_rep',  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com',   'Admin User',   'admin',       'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  ('33333333-3333-3333-3333-333333333333', 'finance@nodwin.com', 'Finance User', 'finance',     'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')
ON CONFLICT (id) DO UPDATE SET
  full_name          = EXCLUDED.full_name,
  primary_role       = EXCLUDED.primary_role,
  primary_entity_id  = EXCLUDED.primary_entity_id;

-- Seed test FX rate (admin-inserted)
INSERT INTO public.fx_rates (id, from_currency, to_currency, rate, source, effective_date, created_by)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'USD', 'INR', 83.50, 'manual', '2026-06-01', '22222222-2222-2222-2222-222222222222')
ON CONFLICT DO NOTHING;

-- ── 1. Authenticated sales rep can read FX rates ──────────────────────────────

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.fx_rates WHERE from_currency = 'USD' AND to_currency = 'INR'$$,
  'sales rep can read FX rates'
);

-- ── 2. Anon cannot read FX rates ─────────────────────────────────────────────

SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.fx_rates WHERE true$$,
  'anon cannot read FX rates'
);

-- ── 3. Sales rep cannot insert FX rate ────────────────────────────────────────

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.fx_rates (id, from_currency, to_currency, rate, source) VALUES (gen_random_uuid(), 'EUR', 'USD', 1.10, 'manual')$$,
  '42501',
  NULL,
  'sales rep cannot insert FX rate'
);

-- ── 4. Sales rep cannot update FX rate ────────────────────────────────────────

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.fx_rates SET rate = 999.99 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT rate FROM public.fx_rates WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  83.50::numeric,
  'sales rep cannot update FX rate (silently blocked)'
);

-- ── 5. Sales rep cannot delete FX rate ────────────────────────────────────────

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.fx_rates WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT isnt_empty(
  $$SELECT id FROM public.fx_rates WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'sales rep cannot delete FX rate (silently blocked)'
);

-- ── 6. Admin can insert FX rate ───────────────────────────────────────────────

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.fx_rates (id, from_currency, to_currency, rate, source) VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'EUR', 'USD', 1.10, 'manual')$$,
  'admin can insert FX rate'
);

-- ── 7. Admin can update FX rate ───────────────────────────────────────────────

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.fx_rates SET rate = 84.00 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT rate FROM public.fx_rates WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  84.00::numeric,
  'admin can update FX rate'
);

-- ── 8. Admin can delete FX rate ───────────────────────────────────────────────

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.fx_rates WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'admin can delete FX rate'
);

-- ── 9. Finance user can insert FX rate ────────────────────────────────────────

SELECT tests.as_user('finance@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.fx_rates (id, from_currency, to_currency, rate, source) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'GBP', 'USD', 1.25, 'manual')$$,
  'finance user can insert FX rate'
);

-- ── 10. Finance user can update FX rate ───────────────────────────────────────

SELECT tests.as_user('finance@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.fx_rates SET rate = 85.00 WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT rate FROM public.fx_rates WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  85.00::numeric,
  'finance user can update FX rate'
);

-- ── 11. Finance user can delete FX rate ───────────────────────────────────────

SELECT tests.as_user('finance@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.fx_rates WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  'finance user can delete FX rate'
);

-- ── 12. Unique constraint: same pair + date + entity blocks duplicate ─────────

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
-- Insert first row succeeds
INSERT INTO public.fx_rates (id, from_currency, to_currency, rate, source, effective_date, entity_id)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'CNY', 'USD', 0.14, 'manual', '2026-06-17', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
-- Second row with same (from, to, date, entity) must fail
SELECT throws_ok(
  $$INSERT INTO public.fx_rates (id, from_currency, to_currency, rate, source, effective_date, entity_id) VALUES (gen_random_uuid(), 'CNY', 'USD', 0.15, 'manual', '2026-06-17', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')$$,
  '23505',
  NULL,
  'duplicate currency pair + date + entity is rejected'
);

SELECT * FROM finish();

ROLLBACK;
