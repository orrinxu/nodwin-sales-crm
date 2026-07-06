-- supabase/tests/forecast_scorecard_aggregates.test.sql
-- Revenue Forecasting & Rep Scorecards: proves the SECURITY INVOKER aggregate
-- functions (a) do the arithmetic correctly and (b) inherit opportunity RLS,
-- including the Confidential-tier fence — a Confidential deal a caller cannot see
-- NEVER contributes to their forecast / scorecard / revenue-curve totals.
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(11);

-- ── Fixtures ──────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('20000000-0000-0000-0000-000000000001', 'fc-repa@nodwin.com',  '{"full_name":"FC Rep A"}'),
  ('20000000-0000-0000-0000-000000000002', 'fc-repb@nodwin.com',  '{"full_name":"FC Rep B"}'),
  ('20000000-0000-0000-0000-000000000008', 'fc-admin@nodwin.com', '{"full_name":"FC Admin"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('20000000-0000-0000-0000-000000000001', 'fc-repa@nodwin.com',  'FC Rep A', 'sales_rep', NULL),
  ('20000000-0000-0000-0000-000000000002', 'fc-repb@nodwin.com',  'FC Rep B', 'sales_rep', NULL),
  ('20000000-0000-0000-0000-000000000008', 'fc-admin@nodwin.com', 'FC Admin', 'admin',     NULL)
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name) VALUES
  ('2e000000-0000-0000-0000-0000000000ee', 'FC Entity') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.business_units (id, name, entity_id, kind) VALUES
  ('2b000000-0000-0000-0000-0000000000bb', 'FC BU', '2e000000-0000-0000-0000-0000000000ee', 'sales')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO public.accounts (id, name, email_domains) VALUES
  ('2a000000-0000-0000-0000-0000000000ac', 'FC Acct', ARRAY['fcacct.com']) ON CONFLICT (id) DO NOTHING;

-- Deal A: STANDARD, OPEN (propose, 50%), owner Rep A — weighted = 100000×0.5 = 50000.
-- Deal B: CONFIDENTIAL, closed_won 200000, owner Rep B — must be fenced from A & admin.
-- Deal C: STANDARD, closed_won 50000, owner Rep A — cycle = 45 days (07-01 → 08-15).
INSERT INTO public.opportunities
  (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency,
   visibility_tier, probability_pct, close_date, created_at) VALUES
  ('2da00000-0000-0000-0000-00000000000a', 'FC Deal A', '2a000000-0000-0000-0000-0000000000ac', 'propose',
     '20000000-0000-0000-0000-000000000001', '2b000000-0000-0000-0000-0000000000bb', 100000, 'USD',
     'standard', 50, '2026-08-15', '2026-07-01'),
  ('2db00000-0000-0000-0000-00000000000b', 'FC Deal B', '2a000000-0000-0000-0000-0000000000ac', 'closed_won',
     '20000000-0000-0000-0000-000000000002', '2b000000-0000-0000-0000-0000000000bb', 200000, 'USD',
     'confidential', 100, '2026-08-20', '2026-06-01'),
  ('2dc00000-0000-0000-0000-00000000000c', 'FC Deal C', '2a000000-0000-0000-0000-0000000000ac', 'closed_won',
     '20000000-0000-0000-0000-000000000001', '2b000000-0000-0000-0000-0000000000bb', 50000, 'USD',
     'standard', 100, '2026-08-15', '2026-07-01');

-- Revenue schedule: A in a unique month (visible to Rep A); B in a unique month
-- (Confidential — only its owner Rep B should ever see it in the curve).
INSERT INTO public.opportunity_revenue_schedule (opportunity_id, month, amount) VALUES
  ('2da00000-0000-0000-0000-00000000000a', '2098-01-01', 111111),
  ('2db00000-0000-0000-0000-00000000000b', '2099-01-01', 777777);

-- ════════════════════════════════════════════════════════════════════════════
-- Rep A — sees only their own two standard deals (A open, C won). Deal B fenced.
-- ════════════════════════════════════════════════════════════════════════════
SELECT tests.as_user('fc-repa@nodwin.com');
SET LOCAL ROLE authenticated;

-- 1. Weighted forecast math: Deal A 100000×0.5 = 50000 (Deal C is won → weighted null).
SELECT is(
  (SELECT coalesce(sum(weighted_amount), 0)
     FROM public.forecast_pipeline_agg('2026-07-01','2026-10-01','2027-01-01')),
  50000::numeric,
  'forecast_pipeline_agg weights open deals correctly (100000 × 50%)');

-- 2. Gross totals exclude the Confidential deal: A(100000)+C(50000)=150000, not 350000.
SELECT is(
  (SELECT coalesce(sum(gross_amount), 0)
     FROM public.forecast_pipeline_agg('2026-07-01','2026-10-01','2027-01-01')),
  150000::numeric,
  'forecast_pipeline_agg excludes Confidential Deal B (200000) from Rep A totals');

-- 3. Scorecard row for Rep A: open/weighted/won/counts/cycle all correct.
SELECT results_eq(
  $$ SELECT open_amount, weighted_amount, won_amount, won_count, lost_count, cycle_days_sum
       FROM public.rep_scorecard_agg('2026-07-01','2026-10-01')
       WHERE owner_user_id = '20000000-0000-0000-0000-000000000001' $$,
  $$ VALUES (100000::numeric, 50000::numeric, 50000::numeric, 1::bigint, 0::bigint, 45::numeric) $$,
  'rep_scorecard_agg computes open/weighted/won/win/cycle for Rep A');

-- 4. Confidential isolation: Rep A's scorecard has NO row for Rep B (owner of Deal B).
SELECT is(
  (SELECT count(*)::int FROM public.rep_scorecard_agg('2026-07-01','2026-10-01')
     WHERE owner_user_id = '20000000-0000-0000-0000-000000000002'),
  0,
  'rep_scorecard_agg: Confidential Deal B never surfaces Rep B in Rep A''s scorecard');

-- 5. Revenue curve: Rep A sees Deal A's scheduled month.
SELECT is(
  (SELECT amount FROM public.forecast_revenue_curve_agg() WHERE month = '2098-01-01'),
  111111::numeric,
  'forecast_revenue_curve_agg returns Rep A''s own scheduled revenue');

-- 6. Revenue curve: Rep A does NOT see Deal B's Confidential scheduled month.
SELECT is_empty(
  $$ SELECT 1 FROM public.forecast_revenue_curve_agg() WHERE month = '2099-01-01' $$,
  'forecast_revenue_curve_agg fences Confidential Deal B''s schedule from Rep A');

-- ════════════════════════════════════════════════════════════════════════════
-- Rep B — the OWNER of the Confidential deal — sees it in their own aggregates.
-- ════════════════════════════════════════════════════════════════════════════
SELECT tests.as_user('fc-repb@nodwin.com');
SET LOCAL ROLE authenticated;

-- 7. Rep B's scorecard credits their Confidential won deal (200000, 1 win).
SELECT results_eq(
  $$ SELECT won_amount, won_count FROM public.rep_scorecard_agg('2026-07-01','2026-10-01')
       WHERE owner_user_id = '20000000-0000-0000-0000-000000000002' $$,
  $$ VALUES (200000::numeric, 1::bigint) $$,
  'rep_scorecard_agg credits the Confidential deal to its owner Rep B');

-- 8. Rep B sees their Confidential deal's scheduled revenue.
SELECT is(
  (SELECT amount FROM public.forecast_revenue_curve_agg() WHERE month = '2099-01-01'),
  777777::numeric,
  'forecast_revenue_curve_agg returns the Confidential schedule to its owner Rep B');

-- ════════════════════════════════════════════════════════════════════════════
-- Admin — the Confidential fence hides Deal B even from an admin (non-member).
-- (Admin can also see other seeded standard deals, so assert the fence, not totals.)
-- ════════════════════════════════════════════════════════════════════════════
SELECT tests.as_user('fc-admin@nodwin.com');
SET LOCAL ROLE authenticated;

-- 9. Admin's scorecard has NO row for Rep B — Deal B (Rep B's only deal) is fenced.
SELECT is(
  (SELECT count(*)::int FROM public.rep_scorecard_agg('2026-07-01','2026-10-01')
     WHERE owner_user_id = '20000000-0000-0000-0000-000000000002'),
  0,
  'rep_scorecard_agg: Confidential Deal B is fenced from a non-member admin');

-- 10. Admin CAN see the standard deals (fence is Confidential-only, not blanket).
SELECT isnt_empty(
  $$ SELECT 1 FROM public.rep_scorecard_agg('2026-07-01','2026-10-01')
       WHERE owner_user_id = '20000000-0000-0000-0000-000000000001' $$,
  'rep_scorecard_agg still returns standard deals to admin (Rep A row present)');

-- 11. Admin's revenue curve does NOT include the Confidential schedule.
SELECT is_empty(
  $$ SELECT 1 FROM public.forecast_revenue_curve_agg() WHERE month = '2099-01-01' $$,
  'forecast_revenue_curve_agg fences the Confidential schedule from admin');

SELECT * FROM finish();
ROLLBACK;
