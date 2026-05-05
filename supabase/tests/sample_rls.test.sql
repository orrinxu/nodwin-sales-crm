-- supabase/tests/sample_rls.test.sql
-- Sample test demonstrating the pgTAP + RLS helper pattern.
-- Uses a placeholder table so this runs before Phase 2 schema exists.
-- All test data is rolled back at the end; nothing pollutes the DB.
--
-- HIGH-RISK FILE — see AGENTS.md §6.

BEGIN;

SELECT plan(6);

-- ── Fixture: placeholder table with RLS ──────────────────────────────────────

CREATE TABLE _rls_sample (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner   uuid NOT NULL,
  payload text
);

GRANT SELECT, INSERT ON _rls_sample TO authenticated;

ALTER TABLE _rls_sample ENABLE ROW LEVEL SECURITY;

-- Authenticated users can only read their own rows.
CREATE POLICY rls_sample_select ON _rls_sample
  FOR SELECT TO authenticated
  USING (owner = auth.uid());

-- Authenticated users can only insert rows they own.
CREATE POLICY rls_sample_insert ON _rls_sample
  FOR INSERT TO authenticated
  WITH CHECK (owner = auth.uid());

-- ── Fixture: two test users ───────────────────────────────────────────────────

INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at, created_at, updated_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    'aaaa0001-0000-0000-0000-000000000001',
    'authenticated', 'authenticated', 'alice@test.nodwin.com',
    'x', NOW(), NOW(), NOW()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'bbbb0002-0000-0000-0000-000000000002',
    'authenticated', 'authenticated', 'bob@test.nodwin.com',
    'x', NOW(), NOW(), NOW()
  );

-- Alice owns one existing row; Bob owns none.
INSERT INTO _rls_sample (id, owner, payload) VALUES
  (
    'cccc0003-0000-0000-0000-000000000003',
    'aaaa0001-0000-0000-0000-000000000001',
    'alice-secret'
  );

-- ── Tests ─────────────────────────────────────────────────────────────────────

-- 1. Alice can see her own row.
SELECT tests.as_user('alice@test.nodwin.com');
SET LOCAL ROLE authenticated;
SELECT tests.assert_can_select(
  '_rls_sample',
  'owner = ''aaaa0001-0000-0000-0000-000000000001''',
  'alice can SELECT her own row'
);

-- 2. Bob cannot see Alice's row (RLS hides it without an error).
SELECT tests.as_user('bob@test.nodwin.com');
SET LOCAL ROLE authenticated;
SELECT tests.assert_cannot_select(
  '_rls_sample',
  'owner = ''aaaa0001-0000-0000-0000-000000000001''',
  'bob cannot SELECT alice''s row'
);

-- 3. Alice can insert a row she owns.
SELECT tests.as_user('alice@test.nodwin.com');
SET LOCAL ROLE authenticated;
SELECT tests.assert_can_insert(
  '_rls_sample',
  format(
    '(gen_random_uuid(), %L, %L)',
    'aaaa0001-0000-0000-0000-000000000001',
    'alice-new-row'
  ),
  'alice can INSERT a row she owns'
);

-- 4. Bob cannot insert a row claiming Alice as owner (WITH CHECK blocks it).
SELECT tests.as_user('bob@test.nodwin.com');
SET LOCAL ROLE authenticated;
SELECT tests.assert_cannot_insert(
  '_rls_sample',
  format(
    '(gen_random_uuid(), %L, %L)',
    'aaaa0001-0000-0000-0000-000000000001',
    'forged-row'
  ),
  'bob cannot INSERT a row owned by alice'
);

-- 5. Bob can insert a row he owns.
SET LOCAL ROLE authenticated;
SELECT tests.assert_can_insert(
  '_rls_sample',
  format(
    '(gen_random_uuid(), %L, %L)',
    'bbbb0002-0000-0000-0000-000000000002',
    'bob-own-row'
  ),
  'bob can INSERT a row he owns'
);

-- 6. Anonymous role sees no rows at all.
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT tests.assert_cannot_select(
  '_rls_sample',
  'true',
  'anon cannot SELECT any rows'
);

SELECT * FROM finish();

ROLLBACK;
