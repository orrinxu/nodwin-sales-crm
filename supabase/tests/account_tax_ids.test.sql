-- supabase/tests/account_tax_ids.test.sql
-- pgTAP: account_tax_ids RLS mirrors the parent account; tax_id_types is
-- read-all / admin-write; backfill from custom_data is correct (ORR-622).
--
-- Run with: supabase test db

BEGIN;

SELECT plan(13);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('aa000001-0001-0001-0001-000000000001', 'admin@nodwin.com', '{"full_name":"Admin"}'),
  ('bb000002-0002-0002-0002-000000000002', 'owner@nodwin.com', '{"full_name":"Owner A"}'),
  ('cc000003-0003-0003-0003-000000000003', 'other@nodwin.com', '{"full_name":"Other Rep"}')
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.users (id, email, full_name, primary_role)
VALUES
  ('aa000001-0001-0001-0001-000000000001', 'admin@nodwin.com', 'Admin',   'admin'),
  ('bb000002-0002-0002-0002-000000000002', 'owner@nodwin.com', 'Owner A', 'sales_rep'),
  ('cc000003-0003-0003-0003-000000000003', 'other@nodwin.com', 'Other Rep','sales_rep')
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

-- Account A owned by Owner A; Account B owned by Other Rep.
INSERT INTO public.accounts (id, name, account_owner_user_id, created_by, custom_data)
VALUES
  ('aca00001-0001-0001-0001-000000000001', 'Acme A', 'bb000002-0002-0002-0002-000000000002', 'bb000002-0002-0002-0002-000000000002', '{"tax_gst_in":"22AAAAA0000A1Z5"}'),
  ('acb00002-0002-0002-0002-000000000002', 'Beta B', 'cc000003-0003-0003-0003-000000000003', 'cc000003-0003-0003-0003-000000000003', '{}')
ON CONFLICT (id) DO NOTHING;

-- A tax id on Account B (so we can test cross-account read isolation).
INSERT INTO public.account_tax_ids (account_id, tax_type, value)
VALUES ('acb00002-0002-0002-0002-000000000002', 'IN_PAN', 'AAAAA1111A')
ON CONFLICT DO NOTHING;

-- ── tax_id_types: read-all, admin-write ──────────────────────────────────────
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;

-- 1. Any authenticated user can read the tax-type registry.
SELECT isnt_empty(
  $$SELECT code FROM public.tax_id_types WHERE code = 'IN_GSTIN'$$,
  'authenticated user can read tax_id_types'
);
-- 2. Non-admin cannot write tax_id_types.
SELECT throws_ok(
  $$INSERT INTO public.tax_id_types (code, label, country_iso) VALUES ('XX_FAKE','Fake','XX')$$,
  '42501', NULL, 'non-admin cannot insert a tax_id_type'
);

-- ── account_tax_ids: mirror the parent account ───────────────────────────────
-- 3. Owner can add a tax id to their OWN account.
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.account_tax_ids (account_id, tax_type, value) VALUES ('aca00001-0001-0001-0001-000000000001','IN_GSTIN','22AAAAA0000A1Z5')$$,
  'account owner can add a tax id to their own account'
);

-- 4. Owner CANNOT add a tax id to another rep''s account.
SELECT throws_ok(
  $$INSERT INTO public.account_tax_ids (account_id, tax_type, value) VALUES ('acb00002-0002-0002-0002-000000000002','IN_GSTIN','22BBBBB0000B1Z5')$$,
  '42501', NULL, 'owner cannot add a tax id to another account'
);

-- 5. Owner can read their own account''s tax ids.
SELECT isnt_empty(
  $$SELECT id FROM public.account_tax_ids WHERE account_id = 'aca00001-0001-0001-0001-000000000001'$$,
  'owner can read own account tax ids'
);

-- 6. Owner CANNOT read another account''s tax ids.
SELECT is_empty(
  $$SELECT id FROM public.account_tax_ids WHERE account_id = 'acb00002-0002-0002-0002-000000000002'$$,
  'owner cannot read another account tax ids'
);

-- 7. Owner can update their own account''s tax id.
UPDATE public.account_tax_ids SET value = '22AAAAA0000A1Z9' WHERE account_id = 'aca00001-0001-0001-0001-000000000001' AND tax_type = 'IN_GSTIN';
SELECT is(
  (SELECT value FROM public.account_tax_ids WHERE account_id = 'aca00001-0001-0001-0001-000000000001' AND tax_type = 'IN_GSTIN'),
  '22AAAAA0000A1Z9',
  'owner can update own account tax id'
);

-- 8. Owner can delete their own account''s tax id.
SELECT lives_ok(
  $$DELETE FROM public.account_tax_ids WHERE account_id = 'aca00001-0001-0001-0001-000000000001' AND tax_type = 'IN_GSTIN'$$,
  'owner can delete own account tax id'
);

-- 9. Other rep cannot read Account A''s (now none) — and cannot write either.
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.account_tax_ids (account_id, tax_type, value) VALUES ('aca00001-0001-0001-0001-000000000001','IN_PAN','ZZZZZ9999Z')$$,
  '42501', NULL, 'other rep cannot add a tax id to Account A'
);

-- ── Admin ────────────────────────────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
-- 10. Admin can add a tax id to any account.
SELECT lives_ok(
  $$INSERT INTO public.account_tax_ids (account_id, tax_type, value) VALUES ('aca00001-0001-0001-0001-000000000001','AE_TRN','123456789012345')$$,
  'admin can add a tax id to any account'
);
-- 11. Admin can read all tax ids.
SELECT is(
  (SELECT count(*)::int FROM public.account_tax_ids),
  2,
  'admin can read all account tax ids'
);
-- 12. Admin can write tax_id_types.
SELECT lives_ok(
  $$INSERT INTO public.tax_id_types (code, label, country_iso) VALUES ('US_EIN','EIN','US')$$,
  'admin can insert a tax_id_type'
);

-- ── Backfill logic ───────────────────────────────────────────────────────────
-- 13. The backfill statement maps a custom_data GSTIN onto a structured row.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.account_tax_ids (account_id, tax_type, value)
SELECT a.id, 'IN_GSTIN', btrim(a.custom_data->>'tax_gst_in')
FROM public.accounts a
WHERE a.id = 'aca00001-0001-0001-0001-000000000001'
  AND a.custom_data ? 'tax_gst_in'
ON CONFLICT (account_id, tax_type, value) DO NOTHING;
SELECT isnt_empty(
  $$SELECT id FROM public.account_tax_ids WHERE account_id = 'aca00001-0001-0001-0001-000000000001' AND tax_type = 'IN_GSTIN' AND value = '22AAAAA0000A1Z5'$$,
  'backfill maps custom_data tax_gst_in onto an IN_GSTIN row'
);

SELECT * FROM finish();

ROLLBACK;
