-- supabase/tests/pipeline_metrics_agg.test.sql
-- pgTAP for pipeline_metrics_agg() (perf audit): the bounded GROUP BY that
-- replaced the unbounded getPipelineMetrics/getPipelineSummary fetch.
-- HIGH-RISK FILE -- see AGENTS.md §6.

BEGIN;

SELECT plan(3);

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
INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', ARRAY['a.com'], '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES
  ('00000000-0000-0000-0000-00000000aaa1', 'Q1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',    '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100, 'USD', 'standard'),
  ('00000000-0000-0000-0000-00000000aaa2', 'Q2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',    '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 200, 'USD', 'standard'),
  ('00000000-0000-0000-0000-00000000bbb1', 'W1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'closed_won', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 500, 'INR', 'standard');

-- The RPC is SECURITY INVOKER; run as postgres (bypasses RLS) to check the pure
-- aggregation. qualify/USD → 2 deals summing 300; closed_won/INR → 1 deal, 500.
SELECT results_eq(
  $$ SELECT gross_amount, deal_count::int FROM public.pipeline_metrics_agg()
     WHERE stage = 'qualify' AND currency = 'USD' $$,
  $$ VALUES (300::numeric, 2) $$,
  'qualify/USD bucket sums 2 deals to 300');

SELECT results_eq(
  $$ SELECT gross_amount, deal_count::int FROM public.pipeline_metrics_agg()
     WHERE stage = 'closed_won' AND currency = 'INR' $$,
  $$ VALUES (500::numeric, 1) $$,
  'closed_won/INR bucket is 1 deal of 500');

-- One bucket per (stage, currency): 2 stages here (qualify, closed_won) → 2 rows.
SELECT results_eq(
  $$ SELECT count(*)::int FROM public.pipeline_metrics_agg() $$,
  $$ VALUES (2) $$,
  'one row per (stage, currency)');

SELECT * FROM finish();

ROLLBACK;
