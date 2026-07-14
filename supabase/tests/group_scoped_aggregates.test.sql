-- supabase/tests/group_scoped_aggregates.test.sql
-- pgTAP: group-scoped dashboard aggregates (ORR-723).
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- region_entity_ids resolves the entity set a role can roll up: exec/group_sales_lead
-- = every entity, regional_head = own-region entities, else none. The group-flagged
-- aggregates narrow by entity_sales_id to that set, ON TOP OF RLS — so a Confidential
-- deal in the region is still excluded, and a non-leadership role sees nothing.
--
-- Run with: supabase test db

BEGIN;

SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner@nodwin.com', '{"full_name":"Owner"}'),
  ('44444444-4444-4444-4444-444444444444', 'rhead@nodwin.com', '{"full_name":"RHead"}'),
  ('55555555-5555-5555-5555-555555555555', 'exec@nodwin.com',  '{"full_name":"Exec"}'),
  ('66666666-6666-6666-6666-666666666666', 'rep@nodwin.com',   '{"full_name":"Rep"}')
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

-- Two regions, one entity each; the regional_head belongs to E1 (West).
INSERT INTO public.regions (id, name) VALUES
  ('c0000000-0000-0000-0000-0000000000e1', 'West'),
  ('c0000000-0000-0000-0000-0000000000e2', 'East');
INSERT INTO public.entities (id, name, region_id) VALUES
  ('e1111111-1111-1111-1111-111111111111', 'E1', 'c0000000-0000-0000-0000-0000000000e1'),
  ('e2222222-2222-2222-2222-222222222222', 'E2', 'c0000000-0000-0000-0000-0000000000e2');

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner@nodwin.com', 'Owner', 'sales_rep',     'e1111111-1111-1111-1111-111111111111'),
  ('44444444-4444-4444-4444-444444444444', 'rhead@nodwin.com', 'RHead', 'regional_head', 'e1111111-1111-1111-1111-111111111111'),
  ('55555555-5555-5555-5555-555555555555', 'exec@nodwin.com',  'Exec',  'exec',          'e1111111-1111-1111-1111-111111111111'),
  ('66666666-6666-6666-6666-666666666666', 'rep@nodwin.com',   'Rep',   'sales_rep',     'e2222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role, primary_entity_id = EXCLUDED.primary_entity_id;

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id) VALUES
  ('b1111111-1111-1111-1111-111111111111', 'BU1', 'e1111111-1111-1111-1111-111111111111', 'sales', NULL),
  ('b2222222-2222-2222-2222-222222222222', 'BU2', 'e2222222-2222-2222-2222-222222222222', 'sales', NULL);
INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', ARRAY['a.com'], '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');

-- Deals owned by the rep-owner (NOT rhead/exec): d1 in E1/West, d2 in E2/East,
-- d1c Confidential in E1. All 'qualify' so the funnel has one stage row.
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, entity_sales_id, amount, currency, visibility_tier) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'D1 West', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 100, 'USD', 'standard'),
  ('00000000-0000-0000-0000-0000000000d2', 'D2 East', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222', 'e2222222-2222-2222-2222-222222222222', 200, 'USD', 'standard'),
  ('00000000-0000-0000-0000-000000000d1c', 'D1 Conf', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 999, 'USD', 'confidential');

-- ══ region_entity_ids: the resolver (checked directly as service role) ══
-- NOTE: assertions are written to survive pre-existing entities in a shared DB —
-- exec compares to "all entities", and the regional_head/rep checks key off the
-- fresh region/entity UUIDs seeded here, which no other row references.
SELECT is(
  (SELECT count(*)::int FROM public.region_entity_ids('55555555-5555-5555-5555-555555555555')),
  (SELECT count(*)::int FROM public.entities),
  'exec region set = every entity');
SELECT isnt_empty(
  $$ SELECT 1 WHERE 'e1111111-1111-1111-1111-111111111111'::uuid IN (SELECT public.region_entity_ids('55555555-5555-5555-5555-555555555555'))
        AND 'e2222222-2222-2222-2222-222222222222'::uuid IN (SELECT public.region_entity_ids('55555555-5555-5555-5555-555555555555')) $$,
  'exec region set includes entities from every region');
SELECT results_eq(
  $$ SELECT * FROM public.region_entity_ids('44444444-4444-4444-4444-444444444444') $$,
  $$ SELECT 'e1111111-1111-1111-1111-111111111111'::uuid $$,
  'regional_head region set is exactly their own region entity');
SELECT is((SELECT count(*)::int FROM public.region_entity_ids('66666666-6666-6666-6666-666666666666')), 0,
  'a plain sales_rep has an empty region set');

-- ══ conversion_funnel_agg group flag (SECURITY INVOKER — RLS + Confidential apply) ══
-- exec is group-wide, so the group flag narrows nothing beyond RLS: the group funnel
-- must equal the unflagged funnel, and neither may count the Confidential deal.
SELECT tests.as_user('exec@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT deal_count FROM public.conversion_funnel_agg(false, true) WHERE stage = 'qualify'),
  (SELECT deal_count FROM public.conversion_funnel_agg() WHERE stage = 'qualify'),
  'exec group funnel adds no narrowing beyond RLS (== unflagged)');
SELECT is_empty(
  $$ SELECT id FROM public.opportunities WHERE id = '00000000-0000-0000-0000-000000000d1c' $$,
  'exec cannot see the Confidential deal (so the aggregate cannot count it)');

-- regional_head narrows to their region: their fresh entity E1 is referenced ONLY by
-- d1 (Standard) and d1c (Confidential, RLS-masked) — so the group funnel counts d1
-- only, robustly regardless of other seed data.
SELECT tests.as_user('rhead@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT deal_count FROM public.conversion_funnel_agg(false, true) WHERE stage = 'qualify'),
  1::bigint,
  'regional_head group funnel counts only the own-region Standard deal (Confidential excluded)');

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$ SELECT 1 FROM public.conversion_funnel_agg(false, true) $$,
  'plain rep group funnel is empty (empty region set)');

-- ══ rep_scorecard_agg group flag ══
SELECT tests.as_user('exec@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$ SELECT 1 FROM public.rep_scorecard_agg('2026-01-01', '2026-12-31', false, true) $$,
  'exec group scorecard returns rows');

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$ SELECT 1 FROM public.rep_scorecard_agg('2026-01-01', '2026-12-31', false, true) $$,
  'plain rep group scorecard is empty');

SELECT * FROM finish();
ROLLBACK;
