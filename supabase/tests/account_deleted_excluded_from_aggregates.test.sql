-- supabase/tests/account_deleted_excluded_from_aggregates.test.sql
-- ORR-804 (c): a soft-deleted account's opportunities are excluded from every
-- reporting aggregate, consistently for all roles. Runs as postgres (RLS
-- bypassed, i.e. the admin-visibility case) to prove the exclusion does NOT rely
-- on the accounts SELECT policy hiding deleted rows.
-- HIGH-RISK FILE -- see AGENTS.md §6.

BEGIN;

SELECT plan(4);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', '{"full_name":"Rep"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', 'Rep', 'sales_rep', NULL)
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name, base_currency) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'E', 'USD');
INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BU1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'sales', NULL);

-- One live account, one soft-deleted account.
INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by, deleted_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Live',    ARRAY['live.com'], '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', NULL),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Deleted', ARRAY['gone.com'], '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', now());

-- One qualify deal on each account, same stage/currency so they'd share a bucket
-- (exercises pipeline_metrics_agg, which spans all stages). Plus one closed_won
-- deal on each: report_top_accounts_agg is closed_won-only (ORR-813), so the live
-- account must have a won deal to appear at all — this makes the deleted-account
-- exclusion a genuine deletion test, not a side effect of the stage filter.
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier, close_date) VALUES
  ('00000000-0000-0000-0000-0000000011ee', 'L1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',    '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100, 'USD', 'standard', NULL),
  ('00000000-0000-0000-0000-0000000022dd', 'D1', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'qualify',    '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 999, 'USD', 'standard', NULL),
  ('00000000-0000-0000-0000-0000000011ff', 'L2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'closed_won', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 500, 'USD', 'standard', '2026-07-15'),
  ('00000000-0000-0000-0000-0000000022ff', 'D2', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'closed_won', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 777, 'USD', 'standard', '2026-07-15');

-- Predicate itself.
SELECT ok(public.account_is_deleted('dddddddd-dddd-dddd-dddd-dddddddddddd'), 'account_is_deleted true for soft-deleted account');
SELECT ok(NOT public.account_is_deleted('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'account_is_deleted false for live account');

-- pipeline_metrics_agg: qualify/USD bucket counts only the live deal (100), not 1099.
SELECT results_eq(
  $$ SELECT gross_amount, deal_count::int FROM public.pipeline_metrics_agg()
     WHERE stage = 'qualify' AND currency = 'USD' $$,
  $$ VALUES (100::numeric, 1) $$,
  'pipeline_metrics_agg excludes the soft-deleted account''s deal');

-- report_top_accounts_agg: only the live account is ranked.
SELECT results_eq(
  $$ SELECT account_id FROM public.report_top_accounts_agg() ORDER BY account_id $$,
  $$ VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid) $$,
  'report_top_accounts_agg omits the soft-deleted account');

SELECT * FROM finish();

ROLLBACK;
