-- supabase/tests/anon_rpc_revocation_orr777.test.sql
-- pgTAP: ORR-777 — anon must not be able to EXECUTE privileged RPCs.
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- The platform default grants EXECUTE to anon (and PUBLIC) on new public
-- functions. Migration 20260718010000 revokes that from a set of privileged
-- RPCs (data-leak / write / DoS) while preserving authenticated access and
-- leaving intentionally-anon functions (signup) and RLS-helper functions alone.
--
-- Assertions check the anon/authenticated grant by name (signature-independent)
-- so they stay stable across overload changes.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(8);

-- Helper expressions inline: bool_or over every overload of a given name.
-- anon must have LOST execute on the revoked set ─────────────────────────────
SELECT is(
  (SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_todays_company_usage'),
  false, 'anon cannot execute get_todays_company_usage (AI-spend leak)');

SELECT is(
  (SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'team_member_ids'),
  false, 'anon cannot execute team_member_ids (org-chart enumeration)');

SELECT is(
  (SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'break_glass_confidential'),
  false, 'anon cannot execute break_glass_confidential (privileged write)');

SELECT is(
  (SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'recompute_visibility_for_opportunities'),
  false, 'anon cannot execute recompute_visibility_for_opportunities (DoS write)');

SELECT is(
  (SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'replace_opportunity_line_items'),
  false, 'anon cannot execute replace_opportunity_line_items (write RPC)');

-- authenticated must KEEP execute ────────────────────────────────────────────
SELECT is(
  (SELECT bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_todays_company_usage'),
  true, 'authenticated retains execute on get_todays_company_usage');

SELECT is(
  (SELECT bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'replace_opportunity_line_items'),
  true, 'authenticated retains execute on replace_opportunity_line_items');

-- control: intentionally-anon signup function must be UNTOUCHED ────────────────
SELECT is(
  (SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE'))
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_email_domain_allowed'),
  true, 'is_email_domain_allowed remains anon-executable (signup, intentional)');

SELECT * FROM finish();
ROLLBACK;
