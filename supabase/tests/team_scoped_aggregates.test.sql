-- supabase/tests/team_scoped_aggregates.test.sql
-- pgTAP: team-scoped dashboard aggregates (ORR-722).
--
-- team_member_ids(root) walks users.manager_user_id to return the reporting
-- subtree (self + all recursive reports). The dashboard "Team" aggregates
-- (conversion_funnel_agg, rep_scorecard_agg) narrow to that subtree via
-- p_team_only, ON TOP of RLS — so an admin, who by RLS sees every deal, gets a
-- Team tab scoped to only THEIR line, and someone outside the line is excluded.
--
-- admin(aaaa) -> m1(bbbb) -> r1(cccc); out(dddd) is outside the line.
--
-- Run with: supabase test db

BEGIN;

SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000000', 'admin@nodwin.com', '{"full_name":"Admin"}'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'm1@nodwin.com',    '{"full_name":"M1"}'),
  ('cccccccc-0000-0000-0000-000000000000', 'r1@nodwin.com',    '{"full_name":"R1"}'),
  ('dddddddd-0000-0000-0000-000000000000', 'out@nodwin.com',   '{"full_name":"Out"}')
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name) VALUES
  ('e0000000-0000-0000-0000-0000000000e1', 'E1');

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id, manager_user_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000000', 'admin@nodwin.com', 'Admin', 'admin',         'e0000000-0000-0000-0000-0000000000e1', NULL),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'm1@nodwin.com',    'M1',    'sales_manager', 'e0000000-0000-0000-0000-0000000000e1', 'aaaaaaaa-0000-0000-0000-000000000000'),
  ('cccccccc-0000-0000-0000-000000000000', 'r1@nodwin.com',    'R1',    'sales_rep',     'e0000000-0000-0000-0000-0000000000e1', 'bbbbbbbb-0000-0000-0000-000000000000'),
  ('dddddddd-0000-0000-0000-000000000000', 'out@nodwin.com',   'Out',   'sales_rep',     'e0000000-0000-0000-0000-0000000000e1', NULL)
ON CONFLICT (id) DO UPDATE SET manager_user_id = EXCLUDED.manager_user_id, primary_role = EXCLUDED.primary_role;

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id) VALUES
  ('f0000000-0000-0000-0000-0000000000f1', 'BU1', 'e0000000-0000-0000-0000-0000000000e1', 'sales', NULL);
INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by)
VALUES ('ac000000-0000-0000-0000-0000000000ac', 'Acct', ARRAY['acct.com'],
        'aaaaaaaa-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000');

-- One standard deal per user: admin+m1+out in 'qualify', r1 in 'propose'.
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'D admin', 'ac000000-0000-0000-0000-0000000000ac', 'qualify', 'aaaaaaaa-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-0000000000f1', 100, 'USD', 'standard'),
  ('00000000-0000-0000-0000-0000000000b1', 'D m1',    'ac000000-0000-0000-0000-0000000000ac', 'qualify', 'bbbbbbbb-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-0000000000f1', 100, 'USD', 'standard'),
  ('00000000-0000-0000-0000-0000000000c1', 'D r1',    'ac000000-0000-0000-0000-0000000000ac', 'propose', 'cccccccc-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-0000000000f1', 100, 'USD', 'standard'),
  ('00000000-0000-0000-0000-0000000000d1', 'D out',   'ac000000-0000-0000-0000-0000000000ac', 'qualify', 'dddddddd-0000-0000-0000-000000000000', 'f0000000-0000-0000-0000-0000000000f1', 100, 'USD', 'standard');

-- ══ team_member_ids: recursion (r1 via m1) + outsider (out) excluded ══
SELECT results_eq(
  $$ SELECT id FROM public.team_member_ids('aaaaaaaa-0000-0000-0000-000000000000') AS t(id) ORDER BY id $$,
  $$ VALUES
       ('aaaaaaaa-0000-0000-0000-000000000000'::uuid),
       ('bbbbbbbb-0000-0000-0000-000000000000'::uuid),
       ('cccccccc-0000-0000-0000-000000000000'::uuid) $$,
  'team_member_ids(admin) = {admin, m1, r1} — recursive, excludes out'
);

-- ══ As admin (authenticated): RLS sees all deals ══
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;

-- Baseline (RLS, not team-scoped): admin sees all four deals → qualify = 3.
SELECT is(
  (SELECT deal_count FROM public.conversion_funnel_agg(false) WHERE stage = 'qualify'),
  3::bigint,
  'conversion_funnel_agg(false): admin RLS-sees all 3 qualify deals (incl. out)'
);

-- Team-only: narrows to admin's line {admin, m1, r1} → qualify = 2 (out dropped).
SELECT is(
  (SELECT deal_count FROM public.conversion_funnel_agg(true) WHERE stage = 'qualify'),
  2::bigint,
  'conversion_funnel_agg(true): narrows below RLS to the line — out excluded'
);
SELECT is(
  (SELECT deal_count FROM public.conversion_funnel_agg(true) WHERE stage = 'propose'),
  1::bigint,
  'conversion_funnel_agg(true): r1 (a recursive report) IS counted'
);

-- Scorecard team-only: a row per in-line owner, none for the outsider.
SELECT is(
  (SELECT count(*) FROM public.rep_scorecard_agg('2000-01-01', '2100-01-01', true)),
  3::bigint,
  'rep_scorecard_agg(team): exactly the 3 in-line owners (admin, m1, r1)'
);
SELECT is(
  (SELECT count(*) FROM public.rep_scorecard_agg('2000-01-01', '2100-01-01', true)
     WHERE owner_user_id = 'dddddddd-0000-0000-0000-000000000000'),
  0::bigint,
  'rep_scorecard_agg(team): the outsider (out) has no row'
);

SELECT * FROM finish();
ROLLBACK;
