-- supabase/tests/accounts.test.sql
-- pgTAP tests for public.accounts and public.account_relationships tables, RLS policies, and triggers.
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(16);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

-- Create auth users (required by FK and RLS helpers).
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin User"}'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', '{"full_name":"Other Rep"}')
ON CONFLICT (id) DO NOTHING;

-- Upsert public.users rows with correct roles.
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', 'Sales Rep', 'sales_rep', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin User', 'admin', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', 'Other Rep', 'sales_rep', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO UPDATE SET
  full_name          = EXCLUDED.full_name,
  primary_role       = EXCLUDED.primary_role,
  primary_entity_id  = EXCLUDED.primary_entity_id;

-- Insert test accounts (as service role to bypass RLS).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.accounts (id, name, email_domains, created_by, updated_by)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tencent', ARRAY['tencent.com', 'tencentmusic.com'], '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Nodwin India', ARRAY['nodwin.com'], '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222');

INSERT INTO public.account_relationships (id, from_account_id, to_account_id, kind)
VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'partner_with');

-- ── 1. Any authenticated user can read accounts ───────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.accounts WHERE name = 'Tencent'$$,
  'rep can read accounts'
);

-- ── 2. Any authenticated user can read account_relationships ──────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.account_relationships WHERE kind = 'partner_with'$$,
  'rep can read account_relationships'
);

-- ── 3. Anon cannot read accounts ─────────────────────────────────────────────
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.accounts WHERE true$$,
  'anon cannot read accounts'
);

-- ── 4. Anon cannot read account_relationships ─────────────────────────────────
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.account_relationships WHERE true$$,
  'anon cannot read account_relationships'
);

-- ── 5. Non-admin cannot insert account ───────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.accounts (id, name) VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Bad Account')$$,
  '42501',
  NULL,
  'rep cannot insert account'
);

-- ── 6. Non-admin cannot update account ───────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.accounts SET name = 'Hacked' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT name FROM public.accounts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Tencent',
  'rep cannot update account (silently blocked)'
);

-- ── 7. Non-admin cannot delete account ───────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.accounts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT isnt_empty(
  $$SELECT id FROM public.accounts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'rep cannot delete account (silently blocked)'
);

-- ── 8. Admin can insert account ──────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.accounts (id, name, email_domains) VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'New Account', ARRAY['new.com'])$$,
  'admin can insert account'
);

-- ── 9. Admin can update account ──────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.accounts SET name = 'Updated Tencent' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT name FROM public.accounts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Updated Tencent',
  'admin can update account'
);

-- ── 10. Admin can insert account_relationship ────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.account_relationships (id, from_account_id, to_account_id, kind) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'subsidiary_of')$$,
  'admin can insert account_relationship'
);

-- ── 11. Non-admin cannot insert account_relationship ─────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.account_relationships (id, from_account_id, to_account_id, kind) VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'partner_with')$$,
  '42501',
  NULL,
  'rep cannot insert account_relationship'
);

-- ── 12. Non-admin cannot update account_relationship ─────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.account_relationships SET notes = 'Hacked' WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SELECT is(
  (SELECT notes FROM public.account_relationships WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  NULL,
  'rep cannot update account_relationship (silently blocked)'
);

-- ── 13. Non-admin cannot delete account_relationship ─────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.account_relationships WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SELECT isnt_empty(
  $$SELECT id FROM public.account_relationships WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  'rep cannot delete account_relationship (silently blocked)'
);

-- ── 14. Duplicate relationship kind is prevented ─────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.account_relationships (id, from_account_id, to_account_id, kind) VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'subsidiary_of')$$,
  '23505',
  NULL,
  'duplicate relationship kind is prevented'
);

-- ── 15. Audit log captures account changes ───────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_log WHERE table_name = 'accounts' AND row_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '>=',
  1,
  'audit_log captured at least one account change for row'
);

-- ── 16. Admin can delete account ─────────────────────────────────────────────
-- Delete the account inserted in test 8 (not the fixture accounts used by relationship tests).
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.accounts WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'$$,
  'admin can delete account'
);

SELECT * FROM finish();

ROLLBACK;
