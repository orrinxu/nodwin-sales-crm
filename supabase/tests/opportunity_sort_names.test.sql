-- supabase/tests/opportunity_sort_names.test.sql
-- pgTAP for ORR-800 denormalized sort keys (account_name / owner_name).
-- Proves: the columns exist; the BEFORE INSERT/UPDATE trigger populates them and
-- follows owner_user_id / account_id changes; renaming a user or account
-- propagates to every opportunity's denormalized name; and the one-time backfill
-- repopulates rows written while the maintenance trigger was disabled.

BEGIN;

SELECT plan(9);

-- ── Seed principals ────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   '{"full_name":"Rep"}'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', '{"full_name":"Other"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   'Rep',   'sales_rep', NULL),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', 'Other', 'sales_rep', NULL)
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'E');
INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BU1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'sales', NULL);
INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A',  ARRAY['a.com'],  '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'A2', ARRAY['a2.com'], '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');

-- ══ 1-2. Columns exist ══
SELECT has_column('public', 'opportunities', 'account_name', 'opportunities.account_name exists');
SELECT has_column('public', 'opportunities', 'owner_name',   'opportunities.owner_name exists');

-- ══ 3-4. INSERT populates both denormalized names from the trigger ══
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'Opp',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',
        '11111111-1111-1111-1111-111111111111',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100, 'USD', 'standard');

SELECT results_eq(
  $$ SELECT owner_name FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000a1' $$,
  $$ VALUES ('Rep'::text) $$, 'INSERT sets owner_name from users.full_name');
SELECT results_eq(
  $$ SELECT account_name FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000a1' $$,
  $$ VALUES ('A'::text) $$, 'INSERT sets account_name from accounts.name');

-- ══ 5. Changing owner_user_id follows through to owner_name ══
UPDATE public.opportunities
   SET owner_user_id = '33333333-3333-3333-3333-333333333333'
 WHERE id='00000000-0000-0000-0000-0000000000a1';
SELECT results_eq(
  $$ SELECT owner_name FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000a1' $$,
  $$ VALUES ('Other'::text) $$, 'changing owner_user_id updates owner_name');

-- ══ 6. Changing account_id follows through to account_name ══
UPDATE public.opportunities
   SET account_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2'
 WHERE id='00000000-0000-0000-0000-0000000000a1';
SELECT results_eq(
  $$ SELECT account_name FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000a1' $$,
  $$ VALUES ('A2'::text) $$, 'changing account_id updates account_name');

-- ══ 7. Renaming the user propagates to owner_name ══
UPDATE public.users SET full_name = 'Renamed Other'
 WHERE id='33333333-3333-3333-3333-333333333333';
SELECT results_eq(
  $$ SELECT owner_name FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000a1' $$,
  $$ VALUES ('Renamed Other'::text) $$, 'renaming a user propagates to owner_name');

-- ══ 8. Renaming the account propagates to account_name ══
UPDATE public.accounts SET name = 'A2 New'
 WHERE id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2';
SELECT results_eq(
  $$ SELECT account_name FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000a1' $$,
  $$ VALUES ('A2 New'::text) $$, 'renaming an account propagates to account_name');

-- ══ 9. Backfill repopulates a row written with the maintenance trigger off ══
ALTER TABLE public.opportunities DISABLE TRIGGER opportunity_sort_names_trigger;
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier)
VALUES ('00000000-0000-0000-0000-0000000000b1', 'Opp2',
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify',
        '11111111-1111-1111-1111-111111111111',
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100, 'USD', 'standard');
ALTER TABLE public.opportunities ENABLE TRIGGER opportunity_sort_names_trigger;

-- Re-run the migration's backfill statements.
UPDATE public.opportunities o SET owner_name = u.full_name
  FROM public.users u
 WHERE u.id = o.owner_user_id AND o.owner_name IS DISTINCT FROM u.full_name;
UPDATE public.opportunities o SET account_name = a.name
  FROM public.accounts a
 WHERE a.id = o.account_id AND o.account_name IS DISTINCT FROM a.name;

SELECT results_eq(
  $$ SELECT owner_name, account_name FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000b1' $$,
  $$ VALUES ('Rep'::text, 'A'::text) $$, 'backfill repopulates owner_name + account_name');

SELECT * FROM finish();
ROLLBACK;
