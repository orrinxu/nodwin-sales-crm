-- supabase/tests/metrics_correctness_orr813.test.sql
-- pgTAP for ORR-813 report_monthly_agg semantics:
--   (b) won deals bucket by CLOSE month, not created month; created deals bucket
--       by created month in the caller's timezone (_tz param).
-- The report_top_accounts_agg closed_won filter is covered in
-- report_and_list_aggregates.test.sql (assertions updated in the same change).
-- HIGH-RISK FILE -- see AGENTS.md §6.

BEGIN;

SELECT plan(6);

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

-- W: created in Jan 2026, WON with a close_date THIS month. The pre-fix RPC
-- bucketed this as a January win; it must now bucket as a current-month win.
-- Ztz: open, created 2026-05-01 03:00 UTC — a boundary instant that falls in a
-- different calendar month depending on the caller's timezone (May in UTC,
-- April in America/Los_Angeles, which is UTC-7 that day).
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, close_date, created_at) VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'W',   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'closed_won', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 7000, 'USD', current_date, timestamptz '2026-01-15 12:00:00+00'),
  ('00000000-0000-0000-0000-0000000000f2', 'Ztz', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', 'qualify',    '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',  100, 'EUR', current_date + 30, timestamptz '2026-05-01 03:00:00+00');

-- ══ (b) Won deals bucket by CLOSE month, not created month (as postgres) ══
-- W closed THIS month → the current-month bucket has the win, worth 7000.
SELECT results_eq(
  $$ SELECT won_count::int, won_amount
     FROM public.report_monthly_agg()
     WHERE month = to_char(current_date, 'YYYY-MM') AND currency = 'USD' $$,
  $$ VALUES (1, 7000::numeric) $$,
  'report_monthly_agg: a Jan-created deal won this month counts in THIS month'
);

-- ...and its CREATED month (Jan 2026) shows it as created, but NOT as won — the
-- phantom-decline bug was charting it as a January win.
SELECT results_eq(
  $$ SELECT won_count::int, created_count::int
     FROM public.report_monthly_agg()
     WHERE month = '2026-01' AND currency = 'USD' $$,
  $$ VALUES (0, 1) $$,
  'report_monthly_agg: the win is NOT double-counted in its created month'
);

-- ══ (b) Created deals bucket in the caller's timezone via _tz ══
-- Under UTC the 03:00Z instant is 2026-05.
SELECT results_eq(
  $$ SELECT created_count::int
     FROM public.report_monthly_agg('UTC')
     WHERE month = '2026-05' AND currency = 'EUR' $$,
  $$ VALUES (1) $$,
  'report_monthly_agg(UTC): boundary deal buckets into May'
);

-- Under America/Los_Angeles (UTC-7 that day) the same instant is 2026-04-30.
SELECT results_eq(
  $$ SELECT created_count::int
     FROM public.report_monthly_agg('America/Los_Angeles')
     WHERE month = '2026-04' AND currency = 'EUR' $$,
  $$ VALUES (1) $$,
  'report_monthly_agg(America/Los_Angeles): the same instant buckets into April'
);

SELECT is_empty(
  $$ SELECT 1 FROM public.report_monthly_agg('America/Los_Angeles')
     WHERE month = '2026-05' AND currency = 'EUR' $$,
  'report_monthly_agg(America/Los_Angeles): it is no longer in May'
);

-- ══ RLS: SECURITY INVOKER — an outsider (member of no deal) aggregates none ══
SELECT tests.as_user('outsider@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT is_empty(
  $$ SELECT 1 FROM public.report_monthly_agg() $$,
  'RLS: a non-entitled user gets no monthly rows'
);

SELECT * FROM finish();
ROLLBACK;
