-- supabase/tests/opportunity_atomic_replace.test.sql
-- pgTAP for the atomic split/team replace RPCs (audit DATA-1/2).
-- Proves: admin can replace (single-transaction), a non-admin is rejected (the
-- pre-existing admin-only write policy is preserved), and the replace fully
-- swaps the set.
-- HIGH-RISK FILE -- see AGENTS.md §6.

BEGIN;

SELECT plan(6);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin"}'),
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   '{"full_name":"Rep"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin', 'admin',     NULL),
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   'Rep',   'sales_rep', NULL)
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.entities (id, name) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'E');
INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BU1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'sales', NULL),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'BU2', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'sales', NULL);
INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', ARRAY['a.com'], '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'Opp', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100, 'USD', 'standard');
-- Pre-existing split that the replace must fully swap out.
INSERT INTO public.opportunity_splits (opportunity_id, sales_unit_id, pct) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100);

-- ══ Admin can replace splits + team ══
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$ SELECT public.replace_opportunity_splits('00000000-0000-0000-0000-0000000000a1',
       '[{"sales_unit_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","pct":60},{"sales_unit_id":"cccccccc-cccc-cccc-cccc-cccccccccccc","pct":40}]'::jsonb) $$,
  'admin can replace opportunity splits');

SELECT lives_ok(
  $$ SELECT public.replace_opportunity_team_members('00000000-0000-0000-0000-0000000000a1',
       '[{"user_id":"11111111-1111-1111-1111-111111111111","role":"contributor"}]'::jsonb) $$,
  'admin can replace opportunity team members');

-- ══ Replace fully swapped the sets ══
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT results_eq(
  $$ SELECT count(*)::int FROM public.opportunity_splits WHERE opportunity_id='00000000-0000-0000-0000-0000000000a1' $$,
  $$ VALUES (2) $$, 'splits replaced: old row gone, 2 new rows');
SELECT results_eq(
  $$ SELECT count(*)::int FROM public.opportunity_team_members WHERE opportunity_id='00000000-0000-0000-0000-0000000000a1' $$,
  $$ VALUES (1) $$, 'team replaced: 1 member');

-- ══ Non-admin is rejected (admin-only write preserved) ══
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.replace_opportunity_splits('00000000-0000-0000-0000-0000000000a1', '[]'::jsonb) $$,
  '42501', NULL, 'non-admin cannot replace splits');
SELECT throws_ok(
  $$ SELECT public.replace_opportunity_team_members('00000000-0000-0000-0000-0000000000a1', '[]'::jsonb) $$,
  '42501', NULL, 'non-admin cannot replace team');

SELECT * FROM finish();
ROLLBACK;
