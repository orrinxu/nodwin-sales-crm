-- supabase/tests/report_and_list_aggregates.test.sql
-- pgTAP for the ORR-757 bounded aggregate RPCs: stuck_deals_value_at_risk,
-- report_monthly_agg, report_top_accounts_agg, distinct_account_industries,
-- opportunities_with_line_items.
-- HIGH-RISK FILE -- see AGENTS.md §6.

BEGIN;

SELECT plan(9);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner@nodwin.com',    '{"full_name":"Owner"}'),
  ('33333333-3333-3333-3333-333333333333', 'outsider@nodwin.com', '{"full_name":"Outsider"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner@nodwin.com',    'Owner',    'sales_rep', NULL),
  ('33333333-3333-3333-3333-333333333333', 'outsider@nodwin.com', 'Outsider', 'sales_rep', NULL)
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.entities (id, name) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'E');
INSERT INTO public.business_units (id, name, entity_id, kind) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BU', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'sales');
INSERT INTO public.accounts (id, name, industry, email_domains, account_owner_user_id, created_by) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acme', 'Gaming', ARRAY['a.com'], '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', 'Beta', 'Media',  ARRAY['b.com'], '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');

-- Opportunities (all owned by owner@): A stale (qualify, created 40d ago, no
-- activity), B fresh (qualify, created 10d ago), C overdue (propose, close
-- yesterday), D fresh-by-activity (qualify, created 100d ago BUT activity 5d
-- ago), E closed_won (excluded from open/stuck).
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, close_date, created_at) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'A', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',    '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1000, 'USD', current_date + 30, now() - interval '40 days'),
  ('00000000-0000-0000-0000-0000000000b1', 'B', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',    '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',  500, 'USD', current_date + 30, now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000000c1', 'C', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', 'propose',    '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 2000, 'USD', current_date - 1,  now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000000d1', 'D', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',    '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 9000, 'USD', current_date + 30, now() - interval '100 days'),
  ('00000000-0000-0000-0000-0000000000e1', 'E', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'closed_won', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 5000, 'USD', current_date,      now() - interval '3 days');
INSERT INTO public.activities (opportunity_id, user_id, type, created_at) VALUES
  ('00000000-0000-0000-0000-0000000000d1', '11111111-1111-1111-1111-111111111111', 'note', now() - interval '5 days');

-- Line items on A only. A's seeded amount (1000) is the authoritative figure the
-- aggregate assertions below are built around, so pin it with the manual-override
-- flag: ORR-815 added a safety-net trigger that recomputes amount from line items
-- on direct DML, which would otherwise drive A's amount down to the line subtotal
-- (100). The override keeps the line item present (for opportunities_with_line_items)
-- while leaving amount manually fixed at 1000.
UPDATE public.opportunities SET line_items_amount_overridden = true
 WHERE id = '00000000-0000-0000-0000-0000000000a1';
INSERT INTO public.opportunity_line_items (opportunity_id, description, quantity, unit_price_amount, position) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Item', 1, 100, 0);

-- ══ Pure aggregation (as postgres; RLS bypassed) ══
-- stuck_deals_value_at_risk: A (stale) + C (overdue) → 3000 across 2 deals;
-- B/D fresh, E closed → excluded. Threshold 30 for every open stage.
SELECT results_eq(
  $$ SELECT gross_amount, deal_count::int
     FROM public.stuck_deals_value_at_risk('{"qualify":30,"meet_and_present":30,"propose":30,"negotiate":30,"verbal_agreement":30}'::jsonb)
     WHERE currency = 'USD' $$,
  $$ VALUES (3000::numeric, 2) $$,
  'stuck_deals_value_at_risk: stale + overdue counted, fresh/closed excluded'
);

-- A higher threshold un-stales A (40d < 45) but C stays overdue → 2000, 1 deal.
SELECT results_eq(
  $$ SELECT gross_amount, deal_count::int
     FROM public.stuck_deals_value_at_risk('{"qualify":45,"meet_and_present":45,"propose":45,"negotiate":45,"verbal_agreement":45}'::jsonb)
     WHERE currency = 'USD' $$,
  $$ VALUES (2000::numeric, 1) $$,
  'stuck_deals_value_at_risk: raising the threshold drops the newly-fresh stale deal, overdue stays'
);

-- report_monthly_agg: the current month has C + E created (won E = 5000).
SELECT results_eq(
  $$ SELECT won_count::int, won_amount
     FROM public.report_monthly_agg()
     WHERE month = to_char(now(), 'YYYY-MM') AND currency = 'USD' $$,
  $$ VALUES (1, 5000::numeric) $$,
  'report_monthly_agg: this month has 1 won worth 5000'
);

-- report_top_accounts_agg: Acme (A+B+D+E = 15500) leads Beta (C = 2000).
SELECT results_eq(
  $$ SELECT gross_amount
     FROM public.report_top_accounts_agg()
     WHERE account_name = 'Acme' AND currency = 'USD' $$,
  $$ VALUES (15500::numeric) $$,
  'report_top_accounts_agg: sums all of an account''s deals'
);
SELECT results_eq(
  $$ SELECT count(*)::int FROM public.report_top_accounts_agg() $$,
  $$ VALUES (2) $$,
  'report_top_accounts_agg: one row per (account, currency) among the top accounts'
);

-- distinct_account_industries: Gaming + Media, distinct + ordered.
SELECT results_eq(
  $$ SELECT industry FROM public.distinct_account_industries() $$,
  $$ VALUES ('Gaming'::text), ('Media'::text) $$,
  'distinct_account_industries: distinct, ordered'
);

-- opportunities_with_line_items: only A, from the requested set.
SELECT results_eq(
  $$ SELECT opportunity_id FROM public.opportunities_with_line_items(
       ARRAY['00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1']::uuid[]) $$,
  $$ VALUES ('00000000-0000-0000-0000-0000000000a1'::uuid) $$,
  'opportunities_with_line_items: DISTINCT presence, scoped to the input ids'
);

-- ══ RLS: SECURITY INVOKER, so an outsider (member of no deal) aggregates none ══
SELECT tests.as_user('outsider@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT is_empty(
  $$ SELECT 1 FROM public.stuck_deals_value_at_risk('{"qualify":1,"meet_and_present":1,"propose":1,"negotiate":1,"verbal_agreement":1}'::jsonb) $$,
  'RLS: a non-entitled user gets no stuck value-at-risk rows'
);

SELECT is_empty(
  $$ SELECT 1 FROM public.report_top_accounts_agg() $$,
  'RLS: a non-entitled user gets no top-account rows'
);

SELECT * FROM finish();
ROLLBACK;
