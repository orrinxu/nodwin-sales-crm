-- supabase/tests/pipeline_metrics_agg_scoped.test.sql
-- pgTAP for pipeline_metrics_agg_scoped() (ORR-755): the scoped GROUP BY that
-- backs the bounded opportunities BOARD totals. Verifies the probability-weighted
-- amount and each narrowing filter (owner scope, close-date window, entity).
-- HIGH-RISK FILE -- see AGENTS.md §6.

BEGIN;

SELECT plan(6);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', '{"full_name":"Rep"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', 'Rep', 'sales_rep', NULL)
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.entities (id, name, base_currency) VALUES
  ('e1111111-1111-1111-1111-111111111111', 'E1', 'USD'),
  ('e2222222-2222-2222-2222-222222222222', 'E2', 'USD');
INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BU1', 'e1111111-1111-1111-1111-111111111111', 'sales', NULL);
INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', ARRAY['a.com'], '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');

-- Two qualify/USD deals (entity E1 / E2, different close dates + probabilities)
-- and one closed_won/INR (entity E1).
INSERT INTO public.opportunities
  (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, probability_pct, entity_sales_id, close_date, visibility_tier) VALUES
  ('00000000-0000-0000-0000-00000000aaa1', 'Q1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',    '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100, 'USD', 50, 'e1111111-1111-1111-1111-111111111111', '2026-07-10', 'standard'),
  ('00000000-0000-0000-0000-00000000aaa2', 'Q2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',    '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 200, 'USD', 25, 'e2222222-2222-2222-2222-222222222222', '2026-08-10', 'standard'),
  ('00000000-0000-0000-0000-00000000bbb1', 'W1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'closed_won', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 500, 'INR', 100, 'e1111111-1111-1111-1111-111111111111', '2026-07-15', 'standard');

-- 1. Unfiltered: qualify/USD sums 2 deals to gross 300, count 2.
SELECT results_eq(
  $$ SELECT gross_amount, deal_count::int FROM public.pipeline_metrics_agg_scoped()
     WHERE stage = 'qualify' AND currency = 'USD' $$,
  $$ VALUES (300::numeric, 2) $$,
  'qualify/USD bucket sums 2 deals to 300');

-- 2. Weighted amount = Σ amount*prob/100 = 100*0.50 + 200*0.25 = 100.
SELECT results_eq(
  $$ SELECT weighted_amount FROM public.pipeline_metrics_agg_scoped()
     WHERE stage = 'qualify' AND currency = 'USD' $$,
  $$ VALUES (100::numeric) $$,
  'qualify/USD weighted amount is probability-weighted (100)');

-- 3. Entity narrowing to E1 keeps only Q1 in qualify/USD (gross 100, count 1).
SELECT results_eq(
  $$ SELECT gross_amount, deal_count::int
     FROM public.pipeline_metrics_agg_scoped(false, NULL, NULL, 'e1111111-1111-1111-1111-111111111111')
     WHERE stage = 'qualify' AND currency = 'USD' $$,
  $$ VALUES (100::numeric, 1) $$,
  'entity filter narrows qualify/USD to the single E1 deal');

-- 4. Close-date window July only excludes Q2 (August) → qualify/USD count 1.
SELECT results_eq(
  $$ SELECT gross_amount, deal_count::int
     FROM public.pipeline_metrics_agg_scoped(false, '2026-07-01', '2026-07-31', NULL)
     WHERE stage = 'qualify' AND currency = 'USD' $$,
  $$ VALUES (100::numeric, 1) $$,
  'close-date window excludes the out-of-range qualify deal');

-- 5. One row per (stage, currency): qualify/USD + closed_won/INR = 2 rows.
SELECT results_eq(
  $$ SELECT count(*)::int FROM public.pipeline_metrics_agg_scoped() $$,
  $$ VALUES (2) $$,
  'one row per (stage, currency)');

-- 6. _owner_only uses auth.uid(); as postgres it is NULL, so owner scope matches
--    nothing — proving the owner filter is actually applied.
SELECT results_eq(
  $$ SELECT count(*)::int FROM public.pipeline_metrics_agg_scoped(true) $$,
  $$ VALUES (0) $$,
  'owner-only scope filters by auth.uid() (none under postgres)');

SELECT * FROM finish();

ROLLBACK;
