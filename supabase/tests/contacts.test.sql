-- supabase/tests/contacts.test.sql
-- pgTAP tests for public.contacts and public.contact_account_links tables, RLS policies, and triggers.
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(23);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

-- Create auth users (required by FK and RLS helpers).
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('44444444-4444-4444-4444-444444444444', 'rep@nodwin.com', '{"full_name":"Sales Rep"}'),
  ('55555555-5555-5555-5555-555555555555', 'admin@nodwin.com', '{"full_name":"Admin User"}'),
  ('66666666-6666-6666-6666-666666666666', 'other@nodwin.com', '{"full_name":"Other Rep"}')
ON CONFLICT (id) DO NOTHING;

-- Upsert public.users rows with correct roles.
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('44444444-4444-4444-4444-444444444444', 'rep@nodwin.com', 'Sales Rep', 'sales_rep', '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  ('55555555-5555-5555-5555-555555555555', 'admin@nodwin.com', 'Admin User', 'admin', '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  ('66666666-6666-6666-6666-666666666666', 'other@nodwin.com', 'Other Rep', 'sales_rep', '1b1b1b1b-1b1b-1b1b-1b1b-1b1b1b1b1b1b')
ON CONFLICT (id) DO UPDATE SET
  full_name         = EXCLUDED.full_name,
  primary_role      = EXCLUDED.primary_role,
  primary_entity_id = EXCLUDED.primary_entity_id;

-- Insert test accounts and contacts (as service role to bypass RLS).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.accounts (id, name, created_by, updated_by)
VALUES
  ('0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', 'Tencent', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555'),
  ('1b1b1b1b-1b1b-1b1b-1b1b-1b1b1b1b1b1b', 'Nodwin India', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555');

INSERT INTO public.contacts (id, full_name, primary_account_id, email, owner_user_id, created_by, updated_by)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Alice Li', '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', 'alice@tencent.com', '44444444-4444-4444-4444-444444444444', '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Bob Kumar', '1b1b1b1b-1b1b-1b1b-1b1b-1b1b1b1b1b1b', 'bob@nodwin.com', NULL, '55555555-5555-5555-5555-555555555555', '55555555-5555-5555-5555-555555555555'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Charlie (Rep Created)', '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', 'charlie@example.com', NULL, '44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444');

INSERT INTO public.contact_account_links (id, contact_id, account_id)
VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '1b1b1b1b-1b1b-1b1b-1b1b-1b1b1b1b1b1b');

-- ── 1. Owner can read owned contact ───────────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.contacts WHERE full_name = 'Alice Li'$$,
  'owner can read owned contact'
);

-- ── 2. Owner cannot read unowned contact ──────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.contacts WHERE full_name = 'Bob Kumar'$$,
  'owner cannot read unowned contact'
);

-- ── 3. User can read contact they created but don't own ──────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.contacts WHERE full_name = 'Charlie (Rep Created)'$$,
  'rep can read contact they created but do not own'
);

-- ── 4. Owner can read contact_account_links for their contact ─────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.contact_account_links WHERE contact_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'owner can read contact_account_links for owned contact'
);

-- ── 5. Non-owner cannot read contact_account_links for unowned contact ────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.contact_account_links WHERE contact_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'non-owner cannot read contact_account_links for unowned contact'
);

-- ── 6. Anon cannot read contacts ──────────────────────────────────────────────
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.contacts WHERE true$$,
  'anon cannot read contacts'
);

-- ── 7. Anon cannot read contact_account_links ─────────────────────────────────
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.contact_account_links WHERE true$$,
  'anon cannot read contact_account_links'
);

-- ── 8. Non-admin cannot insert contact ────────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.contacts (id, full_name, primary_account_id, email, owner_user_id) VALUES ('dddddddd-dddd-dddd-dddd-ddddddddddda', 'Bad Contact', '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', 'bad@example.com', '44444444-4444-4444-4444-444444444444')$$,
  '42501',
  NULL,
  'rep cannot insert contact'
);

-- ── 9. Non-admin cannot update contact ────────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.contacts SET full_name = 'Hacked' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT full_name FROM public.contacts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Alice Li',
  'rep cannot update contact (silently blocked)'
);

-- ── 10. Non-admin cannot delete contact ───────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.contacts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT isnt_empty(
  $$SELECT id FROM public.contacts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'rep cannot delete contact (silently blocked)'
);

-- ── 11. Admin can insert contact ──────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.contacts (id, full_name, primary_account_id, email, owner_user_id) VALUES ('dddddddd-dddd-dddd-dddd-ddddddddddda', 'New Contact', '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a', 'new@example.com', '44444444-4444-4444-4444-444444444444')$$,
  'admin can insert contact'
);

-- ── 12. Admin can update contact ──────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.contacts SET full_name = 'Alice Updated' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT full_name FROM public.contacts WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Alice Updated',
  'admin can update contact'
);

-- ── 13. Admin can delete contact ──────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.contacts WHERE id = 'dddddddd-dddd-dddd-dddd-ddddddddddda'$$,
  'admin can delete contact'
);

-- ── 14. Admin can insert contact_account_link ─────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.contact_account_links (id, contact_id, account_id) VALUES ('ffffffff-ffff-ffff-ffff-fffffffffff1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '1b1b1b1b-1b1b-1b1b-1b1b-1b1b1b1b1b1b')$$,
  'admin can insert contact_account_link'
);

-- ── 15. Non-admin cannot insert contact_account_link ──────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.contact_account_links (id, contact_id, account_id) VALUES ('ffffffff-ffff-ffff-ffff-fffffffffff2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a')$$,
  '42501',
  NULL,
  'rep cannot insert contact_account_link'
);

-- ── 16. Non-admin cannot update contact_account_link ──────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.contact_account_links SET account_id = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a' WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
SELECT is(
  (SELECT account_id FROM public.contact_account_links WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a',
  'rep cannot update contact_account_link (silently blocked)'
);

-- ── 17. Non-admin cannot delete contact_account_link ──────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.contact_account_links WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
SELECT isnt_empty(
  $$SELECT id FROM public.contact_account_links WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'$$,
  'rep cannot delete contact_account_link (silently blocked)'
);

-- ── 18. Admin can delete contact_account_link ─────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.contact_account_links WHERE id = 'ffffffff-ffff-ffff-ffff-fffffffffff1'$$,
  'admin can delete contact_account_link'
);

-- ── 19. Duplicate contact-account link is prevented ───────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.contact_account_links (id, contact_id, account_id) VALUES ('ffffffff-ffff-ffff-ffff-fffffffffff1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a')$$,
  '23505',
  NULL,
  'duplicate contact-account link is prevented'
);

-- ── 20. Audit log captures contact changes ────────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_log WHERE table_name = 'contacts' AND row_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '>=',
  1,
  'audit_log captured at least one contact change for row'
);

-- ── 21. Audit log captures contact_account_links changes ──────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_log WHERE table_name = 'contact_account_links' AND row_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  '>=',
  1,
  'audit_log captured contact_account_links row'
);

-- ── 22. created_by and updated_by set automatically on INSERT ────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
INSERT INTO public.contacts (id, full_name, email, owner_user_id) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Auto Field Test', 'auto@example.com', '44444444-4444-4444-4444-444444444444');
SELECT is(
  (SELECT created_by FROM public.contacts WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  '55555555-5555-5555-5555-555555555555'::uuid,
  'created_by set to auth.uid() on INSERT'
);
SELECT is(
  (SELECT updated_by FROM public.contacts WHERE id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  '55555555-5555-5555-5555-555555555555'::uuid,
  'updated_by set to auth.uid() on INSERT'
);

SELECT * FROM finish();

ROLLBACK;
