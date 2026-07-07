-- supabase/tests/conversion_funnel_agg.test.sql
-- Conversion-by-Stage funnel: proves the SECURITY INVOKER conversion_funnel_agg()
-- (a) counts deals per stage correctly and (b) inherits opportunity RLS,
-- including the Confidential-tier fence — a Confidential deal a caller cannot see
-- NEVER contributes to their funnel counts.
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(6);

-- ── Fixtures ──────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'cf-repa@nodwin.com', '{"full_name":"CF Rep A"}'),
  ('c0000000-0000-0000-0000-000000000002', 'cf-repb@nodwin.com', '{"full_name":"CF Rep B"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'cf-repa@nodwin.com', 'CF Rep A', 'sales_rep', NULL),
  ('c0000000-0000-0000-0000-000000000002', 'cf-repb@nodwin.com', 'CF Rep B', 'sales_rep', NULL)
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name) VALUES
  ('ce000000-0000-0000-0000-0000000000ee', 'CF Entity') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.business_units (id, name, entity_id, kind) VALUES
  ('cb000000-0000-0000-0000-0000000000bb', 'CF BU', 'ce000000-0000-0000-0000-0000000000ee', 'sales')
  ON CONFLICT (id) DO NOTHING;
INSERT INTO public.accounts (id, name, email_domains) VALUES
  ('ca000000-0000-0000-0000-0000000000ac', 'CF Acct', ARRAY['cfacct.com']) ON CONFLICT (id) DO NOTHING;

-- Rep A (all STANDARD): 2× qualify, 1× propose, 1× closed_won, 1× closed_lost.
-- Rep B (CONFIDENTIAL): 1× negotiate — must be fenced from Rep A's funnel.
INSERT INTO public.opportunities
  (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency,
   visibility_tier, probability_pct, close_date, created_at) VALUES
  ('cd000000-0000-0000-0000-000000000001', 'CF Q1', 'ca000000-0000-0000-0000-0000000000ac', 'qualify',
     'c0000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-0000000000bb', 10000, 'USD',
     'standard', 20, '2026-09-01', '2026-07-01'),
  ('cd000000-0000-0000-0000-000000000002', 'CF Q2', 'ca000000-0000-0000-0000-0000000000ac', 'qualify',
     'c0000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-0000000000bb', 20000, 'USD',
     'standard', 20, '2026-09-01', '2026-07-01'),
  ('cd000000-0000-0000-0000-000000000003', 'CF P1', 'ca000000-0000-0000-0000-0000000000ac', 'propose',
     'c0000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-0000000000bb', 30000, 'USD',
     'standard', 50, '2026-09-01', '2026-07-01'),
  ('cd000000-0000-0000-0000-000000000004', 'CF W1', 'ca000000-0000-0000-0000-0000000000ac', 'closed_won',
     'c0000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-0000000000bb', 40000, 'USD',
     'standard', 100, '2026-08-01', '2026-07-01'),
  ('cd000000-0000-0000-0000-000000000005', 'CF L1', 'ca000000-0000-0000-0000-0000000000ac', 'closed_lost',
     'c0000000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-0000000000bb', 50000, 'USD',
     'standard', 0, '2026-08-01', '2026-07-01'),
  ('cd000000-0000-0000-0000-00000000000b', 'CF Conf', 'ca000000-0000-0000-0000-0000000000ac', 'negotiate',
     'c0000000-0000-0000-0000-000000000002', 'cb000000-0000-0000-0000-0000000000bb', 60000, 'USD',
     'confidential', 70, '2026-09-01', '2026-06-01');

-- ════════════════════════════════════════════════════════════════════════════
-- Rep A — sees only their own five standard deals. The Confidential deal is fenced.
-- ════════════════════════════════════════════════════════════════════════════
SELECT tests.as_user('cf-repa@nodwin.com');
SET LOCAL ROLE authenticated;

-- 1. qualify count = 2
SELECT is(
  (SELECT deal_count FROM public.conversion_funnel_agg() WHERE stage = 'qualify'),
  2::bigint,
  'conversion_funnel_agg counts Rep A''s two qualify deals');

-- 2. propose count = 1
SELECT is(
  (SELECT deal_count FROM public.conversion_funnel_agg() WHERE stage = 'propose'),
  1::bigint,
  'conversion_funnel_agg counts Rep A''s propose deal');

-- 3. closed_won count = 1
SELECT is(
  (SELECT deal_count FROM public.conversion_funnel_agg() WHERE stage = 'closed_won'),
  1::bigint,
  'conversion_funnel_agg counts Rep A''s won deal');

-- 4. Grand total = 5 (2+1+1+1), proving the Confidential negotiate deal is excluded.
SELECT is(
  (SELECT coalesce(sum(deal_count), 0) FROM public.conversion_funnel_agg()),
  5::numeric,
  'conversion_funnel_agg total excludes the Confidential deal from Rep A');

-- 5. Explicit fence: the negotiate stage (only the Confidential deal) is absent.
SELECT is_empty(
  $$ SELECT 1 FROM public.conversion_funnel_agg() WHERE stage = 'negotiate' $$,
  'conversion_funnel_agg fences the Confidential negotiate deal from Rep A');

-- ════════════════════════════════════════════════════════════════════════════
-- Rep B — the OWNER of the Confidential deal — sees it in their own funnel.
-- ════════════════════════════════════════════════════════════════════════════
SELECT tests.as_user('cf-repb@nodwin.com');
SET LOCAL ROLE authenticated;

-- 6. Rep B's funnel counts their Confidential negotiate deal.
SELECT is(
  (SELECT deal_count FROM public.conversion_funnel_agg() WHERE stage = 'negotiate'),
  1::bigint,
  'conversion_funnel_agg counts the Confidential deal for its owner Rep B');

SELECT * FROM finish();
ROLLBACK;
