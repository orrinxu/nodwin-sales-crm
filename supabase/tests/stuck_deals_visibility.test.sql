-- supabase/tests/stuck_deals_visibility.test.sql
-- ORR-103: proves the Stuck Deals widget inherits opportunity/activity visibility.
-- The widget adds NO new visibility path — it runs the queries below under RLS:
--   open deals:  SELECT ... FROM opportunities WHERE stage NOT IN (closed_*)
--   staleness:   SELECT max(created_at) FROM activities WHERE opportunity_id = X
-- so this test asserts those exact query shapes return only the entitled set.
-- HIGH-RISK FILE — see AGENTS.md §6.

BEGIN;

SELECT plan(7);

-- ── Fixtures ──────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('10000000-0000-0000-0000-000000000001', 'repa@nodwin.com',  '{"full_name":"Rep A"}'),
  ('10000000-0000-0000-0000-000000000002', 'repb@nodwin.com',  '{"full_name":"Rep B"}'),
  ('10000000-0000-0000-0000-000000000008', 'admin@nodwin.com', '{"full_name":"Admin"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('10000000-0000-0000-0000-000000000001', 'repa@nodwin.com',  'Rep A', 'sales_rep', NULL),
  ('10000000-0000-0000-0000-000000000002', 'repb@nodwin.com',  'Rep B', 'sales_rep', NULL),
  ('10000000-0000-0000-0000-000000000008', 'admin@nodwin.com', 'Admin', 'admin',     NULL)
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name) VALUES ('ee000000-0000-0000-0000-0000000000ee', 'Entity');
INSERT INTO public.business_units (id, name, entity_id, kind) VALUES
  ('bb000000-0000-0000-0000-0000000000bb', 'BU', 'ee000000-0000-0000-0000-0000000000ee', 'sales');
INSERT INTO public.accounts (id, name, email_domains) VALUES
  ('ac000000-0000-0000-0000-0000000000ac', 'Acct', ARRAY['acct.com']);

-- Deal A: standard, OPEN, owned by Rep A.  Deal B: CONFIDENTIAL, OPEN, owned by Rep B.
-- Deal C: owned by Rep A but CLOSED_WON (must never appear in the widget).
INSERT INTO public.opportunities
  (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES
  ('0a000000-0000-0000-0000-00000000000a', 'Deal A', 'ac000000-0000-0000-0000-0000000000ac', 'qualify',
     '10000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000bb', 100000, 'USD', 'standard'),
  ('0b000000-0000-0000-0000-00000000000b', 'Deal B', 'ac000000-0000-0000-0000-0000000000ac', 'negotiate',
     '10000000-0000-0000-0000-000000000002', 'bb000000-0000-0000-0000-0000000000bb', 200000, 'USD', 'confidential'),
  ('0c000000-0000-0000-0000-00000000000c', 'Deal C', 'ac000000-0000-0000-0000-0000000000ac', 'closed_won',
     '10000000-0000-0000-0000-000000000001', 'bb000000-0000-0000-0000-0000000000bb', 300000, 'USD', 'standard');

INSERT INTO public.activities (id, opportunity_id, user_id, type, created_at) VALUES
  ('11111111-0000-0000-0000-00000000000a', '0a000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'note', now() - interval '30 days'),
  ('11111111-0000-0000-0000-00000000000b', '0b000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000002', 'note', now() - interval '10 days');

-- ── Rep A: sees own open deal, not Rep B's confidential, not the closed one ──────
SELECT tests.as_user('repa@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$ SELECT id FROM public.opportunities WHERE stage NOT IN ('closed_won','closed_lost') ORDER BY id $$,
  $$ VALUES ('0a000000-0000-0000-0000-00000000000a'::uuid) $$,
  'Rep A open-deal query returns only their own standard deal (not confidential B, not closed C)');

SELECT isnt_empty(
  $$ SELECT created_at FROM public.activities WHERE opportunity_id = '0a000000-0000-0000-0000-00000000000a' $$,
  'Rep A can read the staleness signal (activities) for their visible deal');

SELECT is_empty(
  $$ SELECT created_at FROM public.activities WHERE opportunity_id = '0b000000-0000-0000-0000-00000000000b' $$,
  'Rep A cannot read activities for the confidential deal they are not on (no mis-aging leak)');

-- ── Rep B: sees own confidential deal ───────────────────────────────────────────
SELECT tests.as_user('repb@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$ SELECT id FROM public.opportunities WHERE stage NOT IN ('closed_won','closed_lost') ORDER BY id $$,
  $$ VALUES ('0b000000-0000-0000-0000-00000000000b'::uuid) $$,
  'Rep B sees only their own (confidential) open deal');

SELECT isnt_empty(
  $$ SELECT created_at FROM public.activities WHERE opportunity_id = '0b000000-0000-0000-0000-00000000000b' $$,
  'Rep B (owner) can read activities for their confidential deal');

-- ── Admin: sees the standard open deal, but the confidential one is fenced ───────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;

-- (scoped to our fixtures: the seeded test DB may contain other standard deals
-- an admin can also see, so assert membership, not the exact set.)
SELECT isnt_empty(
  $$ SELECT id FROM public.opportunities
     WHERE id = '0a000000-0000-0000-0000-00000000000a' AND stage NOT IN ('closed_won','closed_lost') $$,
  'Admin sees the standard open deal via the admin branch');

SELECT is_empty(
  $$ SELECT id FROM public.opportunities WHERE id = '0b000000-0000-0000-0000-00000000000b' $$,
  'Confidential deal is entirely hidden from a non-member admin (tier respected)');

SELECT * FROM finish();
ROLLBACK;
