-- supabase/tests/google_oauth_connections.test.sql
-- pgTAP tests for google_oauth_connections own-row RLS + constraints (ORR-817).
--
-- Mirrors public.api_tokens' access model: STRICTLY own-row (no admin bypass,
-- no service_role policy). Proves a user cannot see/mutate another user's
-- connection, the UNIQUE(user_id) constraint, and the status CHECK.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(11);

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

-- Seed a connection for user B (the "other" user) as service role, bypassing RLS.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.google_oauth_connections
  (id, user_id, google_account_email, access_token_enc, granted_scopes, status)
VALUES
  ('bbbb0001-0001-0001-0001-000000000001',
   '33333333-3333-3333-3333-333333333333',
   'other@gmail.com', 'ciphertext-b', ARRAY['drive.file'], 'connected');

-- ═══════════════════════════════════════════════════════════════════════════════
-- Own-row RLS
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;

-- 1. User A can INSERT own connection
SELECT lives_ok(
  $$INSERT INTO public.google_oauth_connections
      (id, user_id, google_account_email, access_token_enc, granted_scopes, status)
    VALUES ('aaaa0001-0001-0001-0001-000000000001',
            '11111111-1111-1111-1111-111111111111',
            'rep@gmail.com', 'ciphertext-a', ARRAY['drive.file'], 'connected')$$,
  'user can INSERT own google connection'
);

-- 2. User A sees own connection
SELECT isnt_empty(
  $$SELECT id FROM public.google_oauth_connections
    WHERE user_id = '11111111-1111-1111-1111-111111111111'$$,
  'user can SELECT own google connection'
);

-- 3. User A cannot SELECT user B's connection
SELECT is_empty(
  $$SELECT id FROM public.google_oauth_connections
    WHERE user_id = '33333333-3333-3333-3333-333333333333'$$,
  'user cannot SELECT another user google connection'
);

-- 4. User A cannot INSERT a connection for user B (WITH CHECK)
SELECT throws_ok(
  $$INSERT INTO public.google_oauth_connections (id, user_id)
    VALUES ('cccc0001-0001-0001-0001-000000000001', '33333333-3333-3333-3333-333333333333')$$,
  '42501',
  NULL,
  'user cannot INSERT a google connection for another user'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Constraints
-- ═══════════════════════════════════════════════════════════════════════════════

-- 5. Second connection for the same user rejected (UNIQUE user_id)
SELECT throws_ok(
  $$INSERT INTO public.google_oauth_connections (id, user_id)
    VALUES ('aaaa0002-0002-0002-0002-000000000002', '11111111-1111-1111-1111-111111111111')$$,
  '23505',
  NULL,
  'second google connection for the same user rejected by UNIQUE'
);

-- 6. Invalid status rejected (CHECK)
SELECT throws_ok(
  $$UPDATE public.google_oauth_connections SET status = 'bogus'
    WHERE id = 'aaaa0001-0001-0001-0001-000000000001'$$,
  '23514',
  NULL,
  'invalid status rejected by CHECK constraint'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Own-row UPDATE / DELETE isolation
-- ═══════════════════════════════════════════════════════════════════════════════

-- 7. User A can UPDATE own connection (valid status)
UPDATE public.google_oauth_connections SET status = 'expired'
  WHERE id = 'aaaa0001-0001-0001-0001-000000000001';
SELECT is(
  (SELECT status FROM public.google_oauth_connections
     WHERE id = 'aaaa0001-0001-0001-0001-000000000001'),
  'expired',
  'user can UPDATE own google connection'
);

-- 8. User A cannot UPDATE user B's connection (silently blocked)
UPDATE public.google_oauth_connections SET status = 'revoked'
  WHERE id = 'bbbb0001-0001-0001-0001-000000000001';

-- 9. User A cannot DELETE user B's connection (silently blocked)
DELETE FROM public.google_oauth_connections
  WHERE id = 'bbbb0001-0001-0001-0001-000000000001';

-- Verify B's row is untouched, from the service role (bypasses RLS).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status FROM public.google_oauth_connections
     WHERE id = 'bbbb0001-0001-0001-0001-000000000001'),
  'connected',
  'user cannot UPDATE another user google connection (silently blocked)'
);
SELECT isnt_empty(
  $$SELECT id FROM public.google_oauth_connections
    WHERE id = 'bbbb0001-0001-0001-0001-000000000001'$$,
  'user cannot DELETE another user google connection (silently blocked)'
);

-- 10. User A can DELETE own connection
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.google_oauth_connections
    WHERE id = 'aaaa0001-0001-0001-0001-000000000001'$$,
  'user can DELETE own google connection'
);
SELECT is_empty(
  $$SELECT id FROM public.google_oauth_connections
    WHERE user_id = '11111111-1111-1111-1111-111111111111'$$,
  'own google connection is gone after DELETE'
);

SELECT * FROM finish();

ROLLBACK;
