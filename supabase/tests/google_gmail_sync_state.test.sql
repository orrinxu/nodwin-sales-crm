-- supabase/tests/google_gmail_sync_state.test.sql
-- pgTAP tests for the ORR-830 Gmail data model.
--
-- Covers:
--   * google_gmail_sync_state own-row RLS (a user cannot see another user's
--     sync-state row) — mirrors google_calendar_sync_state's access model
--     (ORR-824) / google_oauth_connections (ORR-817).
--   * UNIQUE(user_id) on google_gmail_sync_state.
--   * the partial-unique idempotency key on activities.external_message_id
--     (two activities with the same non-null external_message_id raise 23505).
--
-- Run with: supabase test db

BEGIN;

SELECT plan(6);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   '{"full_name":"Sales Rep"}'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', '{"full_name":"Other Rep"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   'Sales Rep', 'sales_rep'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', 'Other Rep', 'sales_rep')
ON CONFLICT (id) DO UPDATE SET
  full_name    = EXCLUDED.full_name,
  primary_role = EXCLUDED.primary_role;

-- Seed a sync-state row for user B and an account for the activities test, as
-- the service role (bypasses RLS).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.google_gmail_sync_state (id, user_id, sync_enabled, status)
VALUES ('bbbb0001-0001-0001-0001-000000000001',
        '33333333-3333-3333-3333-333333333333', true, 'idle');

INSERT INTO public.accounts (id, name, account_owner_user_id, created_by)
VALUES ('acc00001-0001-0001-0001-000000000001', 'Acme Corp',
        '11111111-1111-1111-1111-111111111111',
        '11111111-1111-1111-1111-111111111111');

-- ═══════════════════════════════════════════════════════════════════════════════
-- google_gmail_sync_state — own-row RLS
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;

-- 1. User A can INSERT own sync-state row
SELECT lives_ok(
  $$INSERT INTO public.google_gmail_sync_state (id, user_id, sync_enabled, status)
    VALUES ('aaaa0001-0001-0001-0001-000000000001',
            '11111111-1111-1111-1111-111111111111', true, 'idle')$$,
  'user can INSERT own gmail sync-state'
);

-- 2. User A sees own sync-state row
SELECT isnt_empty(
  $$SELECT id FROM public.google_gmail_sync_state
    WHERE user_id = '11111111-1111-1111-1111-111111111111'$$,
  'user can SELECT own gmail sync-state'
);

-- 3. User A cannot SELECT user B's sync-state row
SELECT is_empty(
  $$SELECT id FROM public.google_gmail_sync_state
    WHERE user_id = '33333333-3333-3333-3333-333333333333'$$,
  'user cannot SELECT another user gmail sync-state'
);

-- 4. User A cannot INSERT a sync-state row for user B (WITH CHECK)
SELECT throws_ok(
  $$INSERT INTO public.google_gmail_sync_state (id, user_id)
    VALUES ('cccc0001-0001-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333')$$,
  '42501',
  NULL,
  'user cannot INSERT a gmail sync-state for another user'
);

-- 5. Second sync-state row for the same user rejected (UNIQUE user_id)
SELECT throws_ok(
  $$INSERT INTO public.google_gmail_sync_state (id, user_id)
    VALUES ('aaaa0002-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111')$$,
  '23505',
  NULL,
  'second gmail sync-state for the same user rejected by UNIQUE'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- activities.external_message_id — partial-unique idempotency key
-- ═══════════════════════════════════════════════════════════════════════════════

-- Run as service role (the Gmail sync writer path): the unique index rejects a
-- duplicate external_message_id regardless of RLS.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.activities (id, account_id, user_id, type, external_message_id)
VALUES ('ac700001-0001-0001-0001-000000000001',
        'acc00001-0001-0001-0001-000000000001',
        '11111111-1111-1111-1111-111111111111', 'email_inbound', 'gmail-msg-1');

-- 6. A second activity with the same non-null external_message_id is rejected
SELECT throws_ok(
  $$INSERT INTO public.activities (id, account_id, user_id, type, external_message_id)
    VALUES ('ac700002-0002-0002-0002-000000000002',
            'acc00001-0001-0001-0001-000000000001',
            '11111111-1111-1111-1111-111111111111', 'email_inbound', 'gmail-msg-1')$$,
  '23505',
  NULL,
  'duplicate non-null external_message_id rejected by partial-unique index'
);

SELECT * FROM finish();

ROLLBACK;
