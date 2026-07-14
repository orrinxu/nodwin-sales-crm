-- supabase/tests/ai_usage_aggregates.test.sql
-- pgTAP: ai_usage aggregate functions honour ai_usage RLS (ORR-701).
--
-- The aggregates are SECURITY INVOKER, so an admin sees company-wide totals while
-- a plain user sees only their own rows. Seeds at a far-future date so the window
-- can't pick up any pre-existing usage in a shared DB.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(3);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a7010000-0000-0000-0000-000000000001', 'admin701@nodwin.com', '{"full_name":"Admin"}'),
  ('b7010000-0000-0000-0000-000000000001', 'rep701@nodwin.com',   '{"full_name":"Rep"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role) VALUES
  ('a7010000-0000-0000-0000-000000000001', 'admin701@nodwin.com', 'Admin', 'admin'),
  ('b7010000-0000-0000-0000-000000000001', 'rep701@nodwin.com',   'Rep',   'sales_rep')
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.ai_usage (user_id, provider, model, prompt_tokens, completion_tokens, cost_amount, cost_currency, feature, request_id, started_at, status) VALUES
  ('a7010000-0000-0000-0000-000000000001', 'claude', 'm', 100, 50, 1.00, 'USD', 'opportunity_extraction', 'orr701-admin', '2099-01-15T10:00:00Z', 'success'),
  ('b7010000-0000-0000-0000-000000000001', 'claude', 'm', 100, 50, 2.00, 'USD', 'opportunity_extraction', 'orr701-rep',   '2099-01-15T11:00:00Z', 'success');

-- Admin: company-wide — both rows.
SELECT tests.as_user('admin701@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT calls FROM public.ai_usage_totals('2099-01-01', '2099-01-31')),
  2::bigint,
  'admin ai_usage_totals is company-wide (both users)');
SELECT is(
  (SELECT cost FROM public.ai_usage_totals('2099-01-01', '2099-01-31')),
  3.00::numeric,
  'admin ai_usage_totals sums cost across users');

-- Rep: own rows only.
SELECT tests.as_user('rep701@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT calls FROM public.ai_usage_totals('2099-01-01', '2099-01-31')),
  1::bigint,
  'non-admin ai_usage_totals sees only own rows (RLS)');

SELECT * FROM finish();
ROLLBACK;
