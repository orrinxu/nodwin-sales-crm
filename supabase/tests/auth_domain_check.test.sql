-- supabase/tests/auth_domain_check.test.sql
-- pgTAP tests for public.is_email_domain_allowed().
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db
-- All changes are rolled back; nothing persists after the test run.

BEGIN;

SELECT plan(9);

-- Fixture: ensure the allow-listed domains exist in the test snapshot.
INSERT INTO public.auth_allowed_domains (domain) VALUES
  ('nodwin.com'),
  ('trinitygaming.in'),
  ('maxlevel.gg')
ON CONFLICT (domain) DO NOTHING;

SELECT ok(public.is_email_domain_allowed('alice@nodwin.com'),
  'allows an exact allow-listed domain');
SELECT ok(public.is_email_domain_allowed('BOB@NODWIN.COM'),
  'allows case-insensitively');
SELECT ok(public.is_email_domain_allowed('c@trinitygaming.in'),
  'allows a second allow-listed domain');
SELECT ok(NOT public.is_email_domain_allowed('mallory@gmail.com'),
  'rejects an unlisted domain');
SELECT ok(NOT public.is_email_domain_allowed('a@b@nodwin.com'),
  'rejects addresses with multiple @ (bypass attempt)');
SELECT ok(NOT public.is_email_domain_allowed('nodwin.com'),
  'rejects an address with no @');
SELECT ok(NOT public.is_email_domain_allowed('@nodwin.com'),
  'rejects an empty local part');
SELECT ok(NOT public.is_email_domain_allowed('a@'),
  'rejects an empty domain');
SELECT ok(NOT public.is_email_domain_allowed(NULL),
  'rejects NULL');

SELECT * FROM finish();
ROLLBACK;
