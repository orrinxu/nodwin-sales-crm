-- supabase/tests/auth_allowed_domains.test.sql
-- pgTAP tests for the auth_allowed_domains table and RLS policies.
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db
-- All changes are rolled back; nothing persists after the test run.

BEGIN;

SELECT plan(2);

-- ── Fixture: ensure seed rows exist in the test snapshot ─────────────────────

-- The migration seeds these rows, but if tests run against a fresh
-- schema snapshot without the seed, insert them idempotently.
INSERT INTO public.auth_allowed_domains (domain) VALUES
  ('nodwin.com'),
  ('trinitygaming.in'),
  ('maxlevel.gg')
ON CONFLICT (domain) DO NOTHING;

-- ── 1. service_role can SELECT rows ──────────────────────────────────────────
-- service_role bypasses RLS by default in Supabase; this test confirms
-- the table is readable by the identity used by auth hook Edge Functions.
SELECT tests.as_service_role();
SELECT tests.assert_can_select(
  'auth_allowed_domains',
  'true',
  'service_role can SELECT from auth_allowed_domains'
);

-- ── 2. anon role cannot SELECT any rows ──────────────────────────────────────
-- No SELECT policy exists for anon; RLS must block all rows silently.
SELECT tests.as_anon();
SELECT tests.assert_cannot_select(
  'auth_allowed_domains',
  'true',
  'anon cannot SELECT from auth_allowed_domains'
);

SELECT * FROM finish();

ROLLBACK;
