-- supabase/tests/list_visible_sales_entities.test.sql
-- pgTAP: entity-scope options (ORR-717).
--
-- list_visible_sales_entities() is SECURITY INVOKER, so the DISTINCT selling
-- entities it returns are taken over the caller's RLS-visible opportunities
-- ONLY. This proves the never-widen guarantee at the source: the option set a
-- caller gets is always ⊆ the entities present in the deals they can already
-- see — a rep never learns of an entity via a deal they cannot see.
--
-- Run with: supabase test db

BEGIN;

SELECT no_plan();

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'rep_a@nodwin.com', '{"full_name":"Rep A"}'),
  ('b2222222-2222-2222-2222-222222222222', 'rep_b@nodwin.com', '{"full_name":"Rep B"}'),
  ('ad000000-0000-0000-0000-000000000000', 'admin@nodwin.com', '{"full_name":"Admin"}')
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

-- Two selling entities, EA and EB.
INSERT INTO public.entities (id, name) VALUES
  ('e0000000-0000-0000-0000-0000000000ea', 'Entity A'),
  ('e0000000-0000-0000-0000-0000000000eb', 'Entity B');

-- Rep A lives in EA, Rep B in EB; admin is Super Admin.
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'rep_a@nodwin.com', 'Rep A', 'sales_rep', 'e0000000-0000-0000-0000-0000000000ea'),
  ('b2222222-2222-2222-2222-222222222222', 'rep_b@nodwin.com', 'Rep B', 'sales_rep', 'e0000000-0000-0000-0000-0000000000eb'),
  ('ad000000-0000-0000-0000-000000000000', 'admin@nodwin.com', 'Admin', 'admin',     'e0000000-0000-0000-0000-0000000000ea')
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role, primary_entity_id = EXCLUDED.primary_entity_id;

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id) VALUES
  ('ba000000-0000-0000-0000-0000000000ba', 'BU A', 'e0000000-0000-0000-0000-0000000000ea', 'sales', NULL),
  ('bb000000-0000-0000-0000-0000000000bb', 'BU B', 'e0000000-0000-0000-0000-0000000000eb', 'sales', NULL);

INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by)
VALUES ('ac000000-0000-0000-0000-0000000000ac', 'Acct', ARRAY['acct.com'],
        'a1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111');

-- Rep A owns a standard deal selling as EA; Rep B owns one selling as EB. Neither
-- is on the other's team/chain, so a plain rep can see only their own deal.
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, entity_sales_id, amount, currency, visibility_tier) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Deal A', 'ac000000-0000-0000-0000-0000000000ac', 'qualify', 'a1111111-1111-1111-1111-111111111111', 'ba000000-0000-0000-0000-0000000000ba', 'e0000000-0000-0000-0000-0000000000ea', 100, 'USD', 'standard'),
  ('00000000-0000-0000-0000-0000000000b1', 'Deal B', 'ac000000-0000-0000-0000-0000000000ac', 'qualify', 'b2222222-2222-2222-2222-222222222222', 'bb000000-0000-0000-0000-0000000000bb', 'e0000000-0000-0000-0000-0000000000eb', 200, 'USD', 'standard');

-- ══ Rep A: sees only Deal A (EA), so entity options = { Entity A } only ══
SELECT tests.as_user('rep_a@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$ SELECT name FROM public.list_visible_sales_entities() ORDER BY name $$,
  $$ VALUES ('Entity A'::text) $$,
  'Rep A sees exactly the entity of the deal they own — never Entity B'
);
SELECT is_empty(
  $$ SELECT 1 FROM public.list_visible_sales_entities() WHERE name = 'Entity B' $$,
  'Entity B (only in a deal Rep A cannot see) is absent from Rep A''s options'
);

-- ══ Rep B: symmetric — only Entity B ══
SELECT tests.as_user('rep_b@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$ SELECT name FROM public.list_visible_sales_entities() ORDER BY name $$,
  $$ VALUES ('Entity B'::text) $$,
  'Rep B sees exactly their own entity'
);

-- ══ Admin: sees both standard deals, so options = { Entity A, Entity B } ══
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$ SELECT name FROM public.list_visible_sales_entities() ORDER BY name $$,
  $$ VALUES ('Entity A'::text), ('Entity B'::text) $$,
  'Super Admin (sees all deals) gets both entities'
);

-- ⊆ invariant: every entity Rep A can option is one Admin (the widest viewer) can
-- also option — the caller''s set is always a subset of the full visible set.
SELECT tests.as_user('rep_a@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$
    SELECT name FROM public.list_visible_sales_entities()
    EXCEPT
    SELECT unnest(ARRAY['Entity A', 'Entity B'])
  $$,
  'Rep A''s options are a subset of the org-wide entity set (never widens)'
);

SELECT * FROM finish();
ROLLBACK;
