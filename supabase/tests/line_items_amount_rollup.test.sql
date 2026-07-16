-- supabase/tests/line_items_amount_rollup.test.sql
-- pgTAP for the ORR-750 deal-amount rollup: replace/pricing RPCs derive
-- opportunities.amount = Σ line_total − per-deal discount, honour the override
-- toggle, floor at zero, and leave a line-less deal's amount manual.
-- HIGH-RISK FILE -- see AGENTS.md §6.

BEGIN;

SELECT plan(7);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   '{"full_name":"Rep"}'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', '{"full_name":"Other"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
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
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Opp1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100, 'USD', 'standard'),
  ('00000000-0000-0000-0000-0000000000a2', 'Opp2', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 500, 'USD', 'standard');
INSERT INTO public.products (id, name, unit_price_amount, unit_price_currency)
VALUES ('dddd0001-dddd-dddd-dddd-dddddddddddd', 'Banner', 100, 'USD');

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;

-- 1. Replace with 2 lines (180 + 50 = 230) → amount recomputed to 230.
SELECT public.replace_opportunity_line_items('00000000-0000-0000-0000-0000000000a1',
  '[{"product_id":"dddd0001-dddd-dddd-dddd-dddddddddddd","description":"Banner","quantity":2,"unit_price_amount":"100","discount_pct":10},
    {"description":"Custom","quantity":1,"unit_price_amount":"50"}]'::jsonb);
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT results_eq(
  $$ SELECT amount FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000a1' $$,
  $$ VALUES (230::numeric) $$, 'amount = Σ line_total (230)');

-- 2. Per-deal fixed discount 30 → amount 200.
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT public.set_opportunity_line_items_pricing('00000000-0000-0000-0000-0000000000a1', '30', false);
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT results_eq(
  $$ SELECT amount FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000a1' $$,
  $$ VALUES (200::numeric) $$, 'amount = subtotal − deal discount (200)');

-- 3. Override ON pins the amount: replacing lines no longer recomputes it.
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT public.set_opportunity_line_items_pricing('00000000-0000-0000-0000-0000000000a1', '30', true);
SELECT public.replace_opportunity_line_items('00000000-0000-0000-0000-0000000000a1',
  '[{"description":"One","quantity":1,"unit_price_amount":"100"}]'::jsonb);
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT results_eq(
  $$ SELECT amount FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000a1' $$,
  $$ VALUES (200::numeric) $$, 'override pins amount (stays 200 despite new lines)');

-- 4. Override OFF re-derives from the current single line (100 − 30 = 70).
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT public.set_opportunity_line_items_pricing('00000000-0000-0000-0000-0000000000a1', '30', false);
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT results_eq(
  $$ SELECT amount FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000a1' $$,
  $$ VALUES (70::numeric) $$, 'override off re-derives amount (70)');

-- 5. Discount larger than subtotal floors amount at 0.
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT public.set_opportunity_line_items_pricing('00000000-0000-0000-0000-0000000000a1', '1000', false);
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT results_eq(
  $$ SELECT amount FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000a1' $$,
  $$ VALUES (0::numeric) $$, 'discount > subtotal floors amount at 0');

-- 6. A line-less deal keeps its manual amount (replace [] leaves it alone).
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT public.replace_opportunity_line_items('00000000-0000-0000-0000-0000000000a2', '[]'::jsonb);
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT results_eq(
  $$ SELECT amount FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000a2' $$,
  $$ VALUES (500::numeric) $$, 'line-less deal keeps its manual amount (500)');

-- 7. Pricing RPC is authorised: a user without visibility is rejected.
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ SELECT public.set_opportunity_line_items_pricing('00000000-0000-0000-0000-0000000000a1', '0', false) $$,
  '42501', NULL, 'user without visibility cannot set pricing');

SELECT * FROM finish();
ROLLBACK;
