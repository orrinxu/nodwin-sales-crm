-- supabase/tests/products.test.sql
-- pgTAP tests for the products catalog RLS + constraints (ORR-748).
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db
-- All changes are rolled back; nothing persists after the test run.

BEGIN;

SELECT plan(13);

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

-- ── RLS metadata ─────────────────────────────────────────────────────────────

-- 1. RLS is enabled
SELECT has_rls('public', 'products', 'products has RLS enabled');

-- ── Read access ──────────────────────────────────────────────────────────────

-- 2. Anon cannot read
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.products WHERE true$$,
  'anon cannot read products'
);

-- 3. Sales rep can read (empty, not blocked)
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.products WHERE true$$,
  'sales rep can read products (empty, not blocked)'
);

-- ── Write access ─────────────────────────────────────────────────────────────

-- 4. Sales rep cannot insert
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.products (id, name, unit_price_amount, unit_price_currency) VALUES (gen_random_uuid(), 'Rep Product', 100, 'USD')$$,
  '42501',
  NULL,
  'sales rep cannot insert products'
);

-- 5. Admin can insert
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.products (id, name, sku, unit_price_amount, unit_price_currency, display_order) VALUES ('aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Banner Ad', 'BANNER-01', 5000, 'INR', 1)$$,
  'admin can insert products'
);

-- 6. Admin can update
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.products SET unit_price_amount = 6000 WHERE id = 'aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT unit_price_amount FROM public.products WHERE id = 'aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  6000::numeric,
  'admin can update products'
);

-- 7. Sales rep cannot update
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.products SET name = 'Hacked' WHERE id = 'aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT name FROM public.products WHERE id = 'aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Banner Ad',
  'sales rep update is a no-op (row not visible to write policy)'
);

-- 8. Sales rep can read the admin-inserted row
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.products WHERE id = 'aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'sales rep can read admin-created products'
);

-- 9. Sales rep cannot delete
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.products WHERE id = 'aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT isnt_empty(
  $$SELECT id FROM public.products WHERE id = 'aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'sales rep delete is a no-op'
);

-- ── Constraints ──────────────────────────────────────────────────────────────

-- 10. Negative unit price is rejected
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.products (id, name, unit_price_amount) VALUES (gen_random_uuid(), 'Bad Price', -1)$$,
  '23514',
  NULL,
  'negative unit_price_amount is rejected'
);

-- 11. Duplicate SKU is rejected
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.products (id, name, sku) VALUES (gen_random_uuid(), 'Dup Banner', 'BANNER-01')$$,
  '23505',
  NULL,
  'duplicate SKU is rejected'
);

-- 12. Two NULL-SKU products coexist (partial unique)
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.products (id, name) VALUES (gen_random_uuid(), 'No SKU A'), (gen_random_uuid(), 'No SKU B')$$,
  'multiple NULL-SKU products are allowed'
);

-- 13. Admin can delete
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.products WHERE id = 'aaaa0001-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'admin can delete products'
);

SELECT * FROM finish();

ROLLBACK;
