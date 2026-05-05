-- supabase/tests/activities_and_deadletter.test.sql
-- pgTAP tests for public.activities and public.inbound_email_deadletter tables,
-- RLS policies, and triggers.
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(25);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

-- Create auth users.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',  '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin User"}')
ON CONFLICT (id) DO NOTHING;

-- Upsert public.users rows with correct roles.
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',  'Sales Rep',  'sales_rep', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin User', 'admin',     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
ON CONFLICT (id) DO UPDATE SET
  full_name          = EXCLUDED.full_name,
  primary_role       = EXCLUDED.primary_role,
  primary_entity_id  = EXCLUDED.primary_entity_id;

-- Insert test entity and business unit (as service role to bypass RLS).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Test Entity');

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Test BU', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'sales', NULL);

-- Insert test account.
INSERT INTO public.accounts (id, name, email_domains)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Test Account', ARRAY['test.com']);

-- Insert test opportunity.
INSERT INTO public.opportunities (
  id, name, account_id, stage, owner_user_id, sales_initiator_user_id, sales_unit_id, amount, currency, visibility_tier
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Test Opp',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'qualify',
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  100000, 'USD',
  'standard'
);

-- Insert a fixture activity (as service role).
INSERT INTO public.activities (id, account_id, opportunity_id, user_id, type, external_thread_id, subject, body)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '00000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'email',
  'thread-123',
  'Hello',
  'World'
);

-- Insert a fixture deadletter (as service role).
INSERT INTO public.inbound_email_deadletter (id, from_address, to_address, subject, body, reason)
VALUES (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'sender@example.com',
  'dead@crm.nodwin.com',
  'Bad email',
  'Body',
  'forged_sender'
);

-- ── 1. Authenticated user can read activities ────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.activities WHERE type = 'email'$$,
  'rep can read activities'
);

-- ── 2. Anon cannot read activities ───────────────────────────────────────────
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.activities WHERE true$$,
  'anon cannot read activities'
);

-- ── 3. Non-admin cannot insert activity ──────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.activities (id, account_id, user_id, type) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'email')$$,
  '42501',
  NULL,
  'rep cannot insert activity'
);

-- ── 4. Non-admin cannot update activity ──────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.activities SET subject = 'Hacked' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT subject FROM public.activities WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Hello',
  'rep cannot update activity (silently blocked)'
);

-- ── 5. Non-admin cannot delete activity ──────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.activities WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT isnt_empty(
  $$SELECT id FROM public.activities WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'rep cannot delete activity (silently blocked)'
);

-- ── 6. Admin can insert activity ─────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.activities (id, account_id, user_id, type, subject) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'email', 'Admin subject')$$,
  'admin can insert activity'
);

-- ── 7. Admin can update activity ─────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.activities SET subject = 'Updated subject' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT subject FROM public.activities WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Updated subject',
  'admin can update activity'
);

-- ── 8. Admin can delete activity ─────────────────────────────────────────────
-- Delete the activity inserted in test 6.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.activities WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  'admin can delete activity'
);

-- ── 9. Audit log captures activity changes ───────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_log WHERE table_name = 'activities' AND row_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '>=',
  1,
  'audit_log captured at least one activity change for row'
);

-- ── 10. Admin can select deadletter ──────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.inbound_email_deadletter WHERE reason = 'forged_sender'$$,
  'admin can read deadletter'
);

-- ── 11. Non-admin cannot select deadletter ───────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.inbound_email_deadletter WHERE true$$,
  'rep cannot read deadletter'
);

-- ── 12. Anon cannot select deadletter ────────────────────────────────────────
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.inbound_email_deadletter WHERE true$$,
  'anon cannot read deadletter'
);

-- ── 13. Admin can insert deadletter ──────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.inbound_email_deadletter (id, from_address, to_address, reason) VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'a@b.com', 'c@d.com', 'dkim_fail')$$,
  'admin can insert deadletter'
);

-- ── 14. Non-admin cannot insert deadletter ───────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.inbound_email_deadletter (id, from_address, to_address, reason) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'a@b.com', 'c@d.com', 'replay')$$,
  '42501',
  NULL,
  'rep cannot insert deadletter'
);

-- ── 15. Admin can update deadletter ──────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.inbound_email_deadletter SET alert_sent = true WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
SELECT is(
  (SELECT alert_sent FROM public.inbound_email_deadletter WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  true,
  'admin can update deadletter'
);

-- ── 16. Non-admin cannot update deadletter ───────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.inbound_email_deadletter SET alert_sent = false WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
-- Verify as admin that the row is unchanged.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT alert_sent FROM public.inbound_email_deadletter WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  true,
  'rep cannot update deadletter (silently blocked)'
);

-- ── 17. Admin can delete deadletter ──────────────────────────────────────────
-- Delete the deadletter inserted in test 13.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.inbound_email_deadletter WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'$$,
  'admin can delete deadletter'
);

-- ── 18. Non-admin cannot delete deadletter ───────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.inbound_email_deadletter WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
-- Verify as admin that the row still exists.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.inbound_email_deadletter WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'rep cannot delete deadletter (silently blocked)'
);

-- ── 19. Audit log captures deadletter changes ────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_log WHERE table_name = 'inbound_email_deadletter' AND row_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  '>=',
  1,
  'audit_log captured at least one deadletter change for row'
);

-- ── 20. alert_sent defaults to false ─────────────────────────────────────────
-- Use the fixture row (bbbbbbbb...) which was updated to true in test 15, so
-- insert a fresh row to verify the default.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
INSERT INTO public.inbound_email_deadletter (id, from_address, to_address, reason)
VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'x@y.com', 'z@w.com', 'replay');
SELECT is(
  (SELECT alert_sent FROM public.inbound_email_deadletter WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'),
  false,
  'deadletter alert_sent defaults to false'
);

-- ── 21. activities external_thread_id index ──────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT has_index(
  'public',
  'activities',
  'idx_activities_external_thread_id',
  ARRAY['external_thread_id'],
  'external_thread_id index exists'
);

-- ── 22. activities opportunity_id index ──────────────────────────────────────
SELECT has_index(
  'public',
  'activities',
  'idx_activities_opportunity_id',
  ARRAY['opportunity_id'],
  'opportunity_id index exists'
);

-- ── 23. deadletter alert_sent partial index ──────────────────────────────────
SELECT has_index(
  'public',
  'inbound_email_deadletter',
  'idx_deadletter_alert_sent',
  ARRAY['alert_sent'],
  'alert_sent partial index exists'
);

-- ── 24. activities FK to accounts ────────────────────────────────────────────
SELECT has_fk('public', 'activities', 'activities has FK constraints');

-- ── 25. deadletter has no FK ─────────────────────────────────────────────────
SELECT hasnt_fk('public', 'inbound_email_deadletter', 'deadletter has no FK constraints');

SELECT * FROM finish();

ROLLBACK;
