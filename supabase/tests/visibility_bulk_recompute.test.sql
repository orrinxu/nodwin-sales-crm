-- supabase/tests/visibility_bulk_recompute.test.sql
-- pgTAP for the ORR-758 set-based / statement-level visibility recompute. Guards
-- the perf refactor: a MULTI-ROW statement produces the same visibility a per-row
-- recompute did (owner / team / recursive manager-chain / tier gating), and a
-- manager re-org recomputes the reparented user's deals (subtree fan-out).
-- HIGH-RISK FILE (SECURITY-CRITICAL RLS) -- see AGENTS.md §6.

BEGIN;

SELECT plan(7);

-- Users: M2 ← M1 ← R1 (a 2-level chain); M3 (a spare manager); BM (split-unit mgr).
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('75800000-0000-0000-0000-000000000002', 'm2@n.com', '{}'),
  ('75800000-0000-0000-0000-000000000001', 'm1@n.com', '{}'),
  ('75800000-0000-0000-0000-000000000011', 'r1@n.com', '{}'),
  ('75800000-0000-0000-0000-000000000013', 'r3@n.com', '{}'),
  ('75800000-0000-0000-0000-000000000014', 'r4@n.com', '{}'),
  ('75800000-0000-0000-0000-000000000031', 'bm@n.com', '{}'),
  ('75800000-0000-0000-0000-000000000033', 'm3@n.com', '{}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role, manager_user_id) VALUES
  ('75800000-0000-0000-0000-000000000002', 'm2@n.com', 'M2', 'sales_rep', NULL),
  ('75800000-0000-0000-0000-000000000001', 'm1@n.com', 'M1', 'sales_rep', '75800000-0000-0000-0000-000000000002'),
  ('75800000-0000-0000-0000-000000000011', 'r1@n.com', 'R1', 'sales_rep', '75800000-0000-0000-0000-000000000001'),
  ('75800000-0000-0000-0000-000000000013', 'r3@n.com', 'R3', 'sales_rep', NULL),
  ('75800000-0000-0000-0000-000000000014', 'r4@n.com', 'R4', 'sales_rep', NULL),
  ('75800000-0000-0000-0000-000000000031', 'bm@n.com', 'BM', 'sales_rep', NULL),
  ('75800000-0000-0000-0000-000000000033', 'm3@n.com', 'M3', 'sales_rep', NULL)
ON CONFLICT (id) DO UPDATE SET manager_user_id = EXCLUDED.manager_user_id, full_name = EXCLUDED.full_name;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.entities (id, name) VALUES ('758e0000-0000-0000-0000-000000000001', 'E');
INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id) VALUES
  ('758b0000-0000-0000-0000-000000000001', 'BU', '758e0000-0000-0000-0000-000000000001', 'sales', '75800000-0000-0000-0000-000000000031');
INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by) VALUES
  ('758a0000-0000-0000-0000-000000000001', 'A', ARRAY['a.com'], '75800000-0000-0000-0000-000000000011', '75800000-0000-0000-0000-000000000011');

-- ══ BULK: two standard opps owned by R1, inserted in ONE statement ══
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES
  ('758f0000-0000-0000-0000-0000000000a1', 'A1', '758a0000-0000-0000-0000-000000000001', 'qualify', '75800000-0000-0000-0000-000000000011', '758b0000-0000-0000-0000-000000000001', 1, 'USD', 'standard'),
  ('758f0000-0000-0000-0000-0000000000a2', 'A2', '758a0000-0000-0000-0000-000000000001', 'qualify', '75800000-0000-0000-0000-000000000011', '758b0000-0000-0000-0000-000000000001', 1, 'USD', 'standard');

-- Each opp: owner R1 + manager_chain M1 + manager_chain M2 (recursion) = 3 rows.
SELECT is(
  (SELECT count(*)::int FROM public.opportunity_visibility WHERE opportunity_id = '758f0000-0000-0000-0000-0000000000a1'),
  3, 'bulk-inserted opp A1 gets owner + full manager chain');
SELECT is(
  (SELECT count(*)::int FROM public.opportunity_visibility WHERE opportunity_id = '758f0000-0000-0000-0000-0000000000a2'),
  3, 'bulk-inserted opp A2 (same statement) also fully recomputed');
SELECT isnt_empty(
  $$ SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = '758f0000-0000-0000-0000-0000000000a1'
        AND user_id = '75800000-0000-0000-0000-000000000002' AND reason = 'manager_chain' $$,
  'top-of-chain manager (2 levels up) is reached by the recursive walk over the bulk set');

-- R3 joins A1 (standard) as a team member — later used by the re-org test.
INSERT INTO public.opportunity_team_members (opportunity_id, user_id, role, added_by) VALUES
  ('758f0000-0000-0000-0000-0000000000a1', '75800000-0000-0000-0000-000000000013', 'contributor', '75800000-0000-0000-0000-000000000011');

-- ══ Restricted tier: team sees, manager chain does NOT ══
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES
  ('758f0000-0000-0000-0000-0000000000b1', 'B1', '758a0000-0000-0000-0000-000000000001', 'qualify', '75800000-0000-0000-0000-000000000011', '758b0000-0000-0000-0000-000000000001', 1, 'USD', 'restricted');
INSERT INTO public.opportunity_team_members (opportunity_id, user_id, role, added_by) VALUES
  ('758f0000-0000-0000-0000-0000000000b1', '75800000-0000-0000-0000-000000000013', 'contributor', '75800000-0000-0000-0000-000000000011');
SELECT set_eq(
  $$ SELECT reason FROM public.opportunity_visibility WHERE opportunity_id = '758f0000-0000-0000-0000-0000000000b1' $$,
  $$ VALUES ('owner'), ('team:contributor') $$,
  'restricted opp: owner + team member only — no manager_chain / split');

-- ══ Confidential tier: only owner + confidentiality override (team NOT admitted) ══
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier, confidentiality_override_user_ids) VALUES
  ('758f0000-0000-0000-0000-0000000000c1', 'C1', '758a0000-0000-0000-0000-000000000001', 'qualify', '75800000-0000-0000-0000-000000000011', '758b0000-0000-0000-0000-000000000001', 1, 'USD', 'confidential', ARRAY['75800000-0000-0000-0000-000000000014']::uuid[]);
INSERT INTO public.opportunity_team_members (opportunity_id, user_id, role, added_by) VALUES
  ('758f0000-0000-0000-0000-0000000000c1', '75800000-0000-0000-0000-000000000013', 'contributor', '75800000-0000-0000-0000-000000000011');
SELECT set_eq(
  $$ SELECT user_id::text FROM public.opportunity_visibility WHERE opportunity_id = '758f0000-0000-0000-0000-0000000000c1' $$,
  $$ VALUES ('75800000-0000-0000-0000-000000000011'), ('75800000-0000-0000-0000-000000000014') $$,
  'confidential opp: only owner + override — team member is NOT admitted');

-- ══ Manager re-org: give R3 a manager (M3). R3 is a team member on A1 (standard),
--    so A1's manager_chain must now include M3. One UPDATE statement (subtree fan-out). ══
UPDATE public.users SET manager_user_id = '75800000-0000-0000-0000-000000000033'
 WHERE id = '75800000-0000-0000-0000-000000000013';
SELECT isnt_empty(
  $$ SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = '758f0000-0000-0000-0000-0000000000a1'
        AND user_id = '75800000-0000-0000-0000-000000000033' AND reason = 'manager_chain' $$,
  'a manager re-org recomputes the reparented team member''s standard deals');

-- The single-opportunity wrapper still works (referenced elsewhere).
SELECT lives_ok(
  $$ SELECT public.recompute_visibility_for_opportunity('758f0000-0000-0000-0000-0000000000a1') $$,
  'recompute_visibility_for_opportunity wrapper still callable');

SELECT * FROM finish();
ROLLBACK;
