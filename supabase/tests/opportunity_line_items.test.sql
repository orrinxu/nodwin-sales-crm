-- supabase/tests/opportunity_line_items.test.sql
-- pgTAP for opportunity line items (ORR-749): RLS fence + atomic replace RPC.
-- Proves: the deal owner (visibility row) and admin can replace lines; a user
-- with no visibility cannot; admin is fenced from a confidential deal; the
-- generated line_total is correct; custom (off-catalog) lines are allowed.
-- HIGH-RISK FILE -- see AGENTS.md §6.

BEGIN;

SELECT plan(9);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin"}'),
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   '{"full_name":"Rep"}'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', '{"full_name":"Other"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin', 'admin',     NULL),
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   'Rep',   'sales_rep', NULL),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', 'Other', 'sales_rep', NULL)
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.entities (id, name) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'E');
INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BU1', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'sales', NULL);
INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', ARRAY['a.com'], '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');
-- Standard deal owned by the rep (owner gets a visibility row via trigger).
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier)
VALUES ('00000000-0000-0000-0000-0000000000a1', 'Opp', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100, 'USD', 'standard');
-- Confidential deal (also rep-owned) — used to prove the admin fence.
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier)
VALUES ('00000000-0000-0000-0000-0000000000c1', 'Conf', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100, 'USD', 'confidential');
INSERT INTO public.products (id, name, unit_price_amount, unit_price_currency)
VALUES ('dddd0001-dddd-dddd-dddd-dddddddddddd', 'Banner', 100, 'USD');

-- ══ 1. Owner (visibility row) can replace lines: 1 catalog + 1 custom ══
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ SELECT public.replace_opportunity_line_items('00000000-0000-0000-0000-0000000000a1',
       '[{"product_id":"dddd0001-dddd-dddd-dddd-dddddddddddd","description":"Banner","quantity":2,"unit_price_amount":"100","discount_pct":10},
         {"description":"Custom service","quantity":1,"unit_price_amount":"50"}]'::jsonb) $$,
  'deal owner can replace line items');

-- ══ 2-4. Verify the swap, the generated total, and the custom line ══
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT results_eq(
  $$ SELECT count(*)::int FROM public.opportunity_line_items WHERE opportunity_id='00000000-0000-0000-0000-0000000000a1' $$,
  $$ VALUES (2) $$, 'both lines inserted');
SELECT results_eq(
  $$ SELECT line_total FROM public.opportunity_line_items WHERE description='Banner' $$,
  $$ VALUES (180.0000::numeric) $$, 'line_total = qty*price*(1-discount%) = 180');
SELECT results_eq(
  $$ SELECT count(*)::int FROM public.opportunity_line_items WHERE opportunity_id='00000000-0000-0000-0000-0000000000a1' AND product_id IS NULL $$,
  $$ VALUES (1) $$, 'custom off-catalog line (null product) persisted');

-- ══ 5. A user with no visibility cannot replace ══
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.replace_opportunity_line_items('00000000-0000-0000-0000-0000000000a1', '[]'::jsonb) $$,
  '42501', NULL, 'user without visibility cannot replace line items');

-- ══ 6. Admin is fenced from a confidential deal ══
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.replace_opportunity_line_items('00000000-0000-0000-0000-0000000000c1', '[]'::jsonb) $$,
  '42501', NULL, 'admin cannot replace line items on a confidential deal');

-- ══ 7. Admin can replace on a standard deal ══
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ SELECT public.replace_opportunity_line_items('00000000-0000-0000-0000-0000000000a1',
       '[{"product_id":"dddd0001-dddd-dddd-dddd-dddddddddddd","description":"Banner","quantity":1,"unit_price_amount":"100"}]'::jsonb) $$,
  'admin can replace line items on a standard deal');

-- ══ 8-9. SELECT RLS: no-visibility user sees nothing, owner sees the rows ══
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$ SELECT id FROM public.opportunity_line_items WHERE opportunity_id='00000000-0000-0000-0000-0000000000a1' $$,
  'user without visibility cannot read line items');

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$ SELECT id FROM public.opportunity_line_items WHERE opportunity_id='00000000-0000-0000-0000-0000000000a1' $$,
  'deal owner can read line items');

SELECT * FROM finish();
ROLLBACK;
