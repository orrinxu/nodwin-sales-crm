-- supabase/tests/accounts.test.sql
-- pgTAP tests for public.accounts and public.account_relationships tables, RLS policies, and triggers.
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(24);

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

INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by, updated_by)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tencent', ARRAY['tencent.com', 'tencentmusic.com'], '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Nodwin India', ARRAY['nodwin.com'], NULL, '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222'),
  ('dddddddd-dddd-dddd-dddd-ddddddddddda', 'Unowned Corp', ARRAY['unowned.com'], NULL, '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Rep Created Corp', ARRAY['repcreated.com'], NULL, '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');

INSERT INTO public.account_relationships (id, from_account_id, to_account_id, kind)
VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'partner_with'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddb', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'dddddddd-dddd-dddd-dddd-ddddddddddda', 'subsidiary_of'),
  ('ffffffff-ffff-ffff-ffff-fffffffffff1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'sister_company');

-- ── 1. User can read owned account ────────────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.accounts WHERE name = 'Tencent'$$,
  'rep can read owned account'
);

-- ── 2. User cannot read unowned account ──────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.accounts WHERE name = 'Nodwin India'$$,
  'rep cannot read unowned account'
);

-- ── 2a. User can read account they created but don't own ─────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.accounts WHERE name = 'Rep Created Corp'$$,
  'rep can read account they created but do not own'
);

-- ── 3. User can read relationship when they own one linked account ────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.account_relationships WHERE kind = 'partner_with'$$,
  'rep can read relationship for owned account'
);

-- ── 3a. User can read relationship when they own the to_account (by created_by)
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.account_relationships WHERE kind = 'sister_company'$$,
  'rep can read relationship where they created the to_account'
);

-- ── 4. User cannot read relationship when they own no linked account ──────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.account_relationships WHERE kind = 'subsidiary_of'$$,
  'rep cannot read relationship for unowned accounts'
);

-- ── 5. Anon cannot read accounts ─────────────────────────────────────────────
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.accounts WHERE true$$,
  'anon cannot read accounts'
);

-- ── 6. Anon cannot read account_relationships ─────────────────────────────────
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.account_relationships WHERE true$$,
  'anon cannot read account_relationships'
);

-- ── 7. Rep can insert their own account (ORR-608) ─────────────────────────────
-- created_by defaults to auth.uid() via the audit-fields trigger, satisfying
-- the INSERT WITH CHECK (created_by = auth.uid()).
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.accounts (id, name) VALUES ('a7a7a7a7-a7a7-a7a7-a7a7-a7a7a7a7a7a7', 'Rep New Account')$$,
  'rep can insert their own account'
);

-- ── 7a. Rep cannot spoof created_by to another user ───────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.accounts (id, name, created_by) VALUES ('a8a8a8a8-a8a8-a8a8-a8a8-a8a8a8a8a8a8', 'Spoofed', '22222222-2222-2222-2222-222222222222')$$,
  '42501',
  NULL,
  'rep cannot insert an account attributed to another user'
);

-- ── 8. Rep can update an account they own (ORR-608) ───────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.accounts SET name = 'Rep Edited Tencent' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT name FROM public.accounts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Rep Edited Tencent',
  'rep can update an account they own'
);

-- ── 8a. Rep cannot update an account they neither own nor created ─────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.accounts SET name = 'Hacked' WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
-- Verify as service role: the rep cannot see the unowned account, so read it
-- back with RLS bypassed to confirm the name is untouched.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT name FROM public.accounts WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  'Nodwin India',
  'rep cannot update an unowned account (silently blocked)'
);

-- ── 9. Non-admin cannot delete account ───────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.accounts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT isnt_empty(
  $$SELECT id FROM public.accounts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'rep cannot delete account (silently blocked)'
);

-- ── 10. Admin can insert account ─────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.accounts (id, name, email_domains) VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'New Account', ARRAY['new.com'])$$,
  'admin can insert account'
);

-- ── 11. Admin can update account ─────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.accounts SET name = 'Updated Tencent' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT name FROM public.accounts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Updated Tencent',
  'admin can update account'
);

-- ── 12. Admin can insert account_relationship ────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.account_relationships (id, from_account_id, to_account_id, kind) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'subsidiary_of')$$,
  'admin can insert account_relationship'
);

-- ── 13. Non-admin cannot insert account_relationship ─────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.account_relationships (id, from_account_id, to_account_id, kind) VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'partner_with')$$,
  '42501',
  NULL,
  'rep cannot insert account_relationship'
);

-- ── 14. Non-admin cannot update account_relationship ─────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.account_relationships SET notes = 'Hacked' WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SELECT is(
  (SELECT notes FROM public.account_relationships WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  NULL,
  'rep cannot update account_relationship (silently blocked)'
);

-- ── 15. Non-admin cannot delete account_relationship ─────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.account_relationships WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
SELECT isnt_empty(
  $$SELECT id FROM public.account_relationships WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  'rep cannot delete account_relationship (silently blocked)'
);

-- ── 16. Duplicate relationship kind is prevented ─────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.account_relationships (id, from_account_id, to_account_id, kind) VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'subsidiary_of')$$,
  '23505',
  NULL,
  'duplicate relationship kind is prevented'
);

-- ── 17. Audit log captures account changes ───────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_log WHERE table_name = 'accounts' AND row_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '>=',
  1,
  'audit_log captured at least one account change for row'
);

-- ── 18. Admin can delete account ─────────────────────────────────────────────
-- Delete the account inserted in test 10 (not the fixture accounts used by relationship tests).
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.accounts WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'$$,
  'admin can delete account'
);

-- ── 19. Soft-deleted account not visible to owner (non-admin) ─────────────────
-- Soft-delete Tencent (id=aaaaaaaa-...) by setting deleted_at as service_role.
-- Note: test 11 renamed this account to 'Updated Tencent', so we filter by id.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.accounts SET deleted_at = now() WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.accounts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'rep cannot see soft-deleted owned account'
);

-- ── 20. Soft-deleted account visible to admin ──────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.accounts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'admin can see soft-deleted account'
);

-- Restore Tencent.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.accounts SET deleted_at = NULL WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT * FROM finish();

ROLLBACK;
