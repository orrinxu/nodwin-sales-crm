-- supabase/tests/region_group_visibility.test.sql
-- pgTAP: region/group visibility short-circuit (ORR-714 / T-140).
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- regional_head sees deals (and their children) in every entity sharing their own
-- entity's region — but NOT other regions, and NOT Confidential. exec sees every
-- entity (group-wide) except Confidential. A plain rep who neither owns nor is on
-- the deal sees none of it. The access is purely additive (short-circuit).
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

-- Two regions, one entity each; the region_head belongs to E1 (region West).
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

-- Deals owned by the rep-owner (NOT by rhead/exec), so their access can only come
-- from the role-scope branch: d1 in E1/West, d2 in E2/East, d1c Confidential in E1.
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, entity_sales_id, amount, currency, visibility_tier) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'D1 West',  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 100, 'USD', 'standard'),
  ('00000000-0000-0000-0000-0000000000d2', 'D2 East',  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'b2222222-2222-2222-2222-222222222222', 'e2222222-2222-2222-2222-222222222222', 200, 'USD', 'standard'),
  ('00000000-0000-0000-0000-000000000d1c', 'D1 Conf',  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'e1111111-1111-1111-1111-111111111111', 999, 'USD', 'confidential');

INSERT INTO public.cashflow_milestone (opportunity_id, direction, label, scheduled_month, amount, currency, created_by) VALUES
  ('00000000-0000-0000-0000-0000000000d1', 'out', 'W milestone', '2026-02-01', 10, 'USD', '11111111-1111-1111-1111-111111111111'),
  ('00000000-0000-0000-0000-0000000000d2', 'out', 'E milestone', '2026-02-01', 20, 'USD', '11111111-1111-1111-1111-111111111111');

-- ══ regional_head (E1 / West) ══
SELECT tests.as_user('rhead@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT isnt_empty($$ SELECT id FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000d1' $$,
  'regional_head sees a Standard deal in their region');
SELECT is_empty($$ SELECT id FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000d2' $$,
  'regional_head does NOT see a deal in another region');
SELECT is_empty($$ SELECT id FROM public.opportunities WHERE id='00000000-0000-0000-0000-000000000d1c' $$,
  'regional_head does NOT see a Confidential deal in their region (tier ceiling)');
SELECT isnt_empty($$ SELECT id FROM public.cashflow_milestone WHERE opportunity_id='00000000-0000-0000-0000-0000000000d1' $$,
  'regional_head sees children of an in-region deal');
SELECT is_empty($$ SELECT id FROM public.cashflow_milestone WHERE opportunity_id='00000000-0000-0000-0000-0000000000d2' $$,
  'regional_head does NOT see children of an out-of-region deal');

-- ══ exec (group-wide) ══
SELECT tests.as_user('exec@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT isnt_empty($$ SELECT id FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000d1' $$,
  'exec sees a deal in region West');
SELECT isnt_empty($$ SELECT id FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000d2' $$,
  'exec sees a deal in region East (group-wide)');
SELECT is_empty($$ SELECT id FROM public.opportunities WHERE id='00000000-0000-0000-0000-000000000d1c' $$,
  'exec does NOT see a Confidential deal (tier ceiling)');

-- ══ plain rep (E2), not owner, not on the deal ══
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT is_empty($$ SELECT id FROM public.opportunities WHERE id IN ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000d1c') $$,
  'a plain rep gets no role-scope access');

SELECT * FROM finish();
ROLLBACK;
