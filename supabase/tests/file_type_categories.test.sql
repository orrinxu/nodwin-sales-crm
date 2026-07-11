-- supabase/tests/file_type_categories.test.sql
-- pgTAP tests for public.file_type_categories table, RLS policies, and triggers
-- (ORR-659).
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(15);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',  '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin User"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',  'Sales Rep',  'sales_rep', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin User', 'admin',     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT (id) DO UPDATE SET
  full_name          = EXCLUDED.full_name,
  primary_role       = EXCLUDED.primary_role,
  primary_entity_id  = EXCLUDED.primary_entity_id;

-- ── 1. Table has RLS enabled ──────────────────────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT has_rls('public', 'file_type_categories', 'file_type_categories has RLS enabled');

-- ── 2. Policies exist ─────────────────────────────────────────────────────────
SELECT has_policy('public', 'file_type_categories', 'file_type_categories_select_authenticated', 'select policy exists');
SELECT has_policy('public', 'file_type_categories', 'file_type_categories_insert_admin', 'insert policy exists');
SELECT has_policy('public', 'file_type_categories', 'file_type_categories_update_admin', 'update policy exists');
SELECT has_policy('public', 'file_type_categories', 'file_type_categories_delete_admin', 'delete policy exists');
SELECT has_policy('public', 'file_type_categories', 'file_type_categories_service_role_all', 'service_role policy exists');

-- ── 3. Seed data is present ───────────────────────────────────────────────────
SELECT is(
  (SELECT label FROM public.file_type_categories WHERE code = 'rfp'),
  'RFP',
  'seed: rfp category exists'
);
SELECT is(
  (SELECT label FROM public.file_type_categories WHERE code = 'other'),
  'Other',
  'seed: other category exists'
);

-- ── 4. Non-admin (sales_rep) can read file_type_categories ────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT code FROM public.file_type_categories WHERE code = 'contract'$$,
  'non-admin authenticated can read file_type_categories'
);

-- ── 5. Non-admin cannot insert ────────────────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.file_type_categories (code, label) VALUES ('new_cat', 'New Cat')$$,
  '42501',
  NULL,
  'non-admin cannot insert file_type_category'
);

-- ── 6. Non-admin cannot update ────────────────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.file_type_categories SET label = 'Hacked' WHERE code = 'rfp';
SELECT is(
  (SELECT label FROM public.file_type_categories WHERE code = 'rfp'),
  'RFP',
  'non-admin cannot update file_type_category (silently blocked)'
);

-- ── 7. Non-admin cannot delete ────────────────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.file_type_categories WHERE code = 'rfp';
SELECT isnt_empty(
  $$SELECT code FROM public.file_type_categories WHERE code = 'rfp'$$,
  'non-admin cannot delete file_type_category (silently blocked)'
);

-- ── 8. Admin can insert ───────────────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.file_type_categories (code, label) VALUES ('admin_cat', 'Admin Category')$$,
  'admin can insert file_type_category'
);

-- ── 9. Admin can update ───────────────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.file_type_categories SET label = 'Admin Updated' WHERE code = 'admin_cat';
SELECT is(
  (SELECT label FROM public.file_type_categories WHERE code = 'admin_cat'),
  'Admin Updated',
  'admin can update file_type_category'
);

-- ── 10. Admin can delete ──────────────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.file_type_categories WHERE code = 'admin_cat'$$,
  'admin can delete file_type_category'
);

SELECT * FROM finish();

ROLLBACK;
