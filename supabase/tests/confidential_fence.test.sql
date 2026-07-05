-- supabase/tests/confidential_fence.test.sql
-- pgTAP invariant: the Confidential-tier admin fence holds on EVERY opportunity
-- child path (SEC-1..4). A non-member admin gets zero access to a Confidential
-- deal's revenue schedule, stage history, audit rows, and cannot update/delete
-- it — while Standard deals stay admin-accessible and members keep their access.
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(12);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner@nodwin.com', '{"full_name":"Owner"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin"}'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', '{"full_name":"Other"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner@nodwin.com', 'Owner', 'sales_rep', NULL),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin', 'admin',     NULL),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', 'Other', 'sales_rep', NULL)
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'E');
INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'BU', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'sales', NULL);
INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', ARRAY['a.com'], '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');

-- a1 = STANDARD, a2 = CONFIDENTIAL, both owned by the rep (not the admin).
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Std', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100, 'USD', 'standard'),
  ('00000000-0000-0000-0000-0000000000a2', 'Conf','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 999, 'USD', 'confidential');

INSERT INTO public.opportunity_revenue_schedule (opportunity_id, month, amount) VALUES
  ('00000000-0000-0000-0000-0000000000a1', '2026-01-01', 50),
  ('00000000-0000-0000-0000-0000000000a2', '2026-01-01', 500);

-- created_by = a THIRD user, so the rep's access below can only come from
-- opportunity_visibility membership (proves the SEC-4 under-return fix), and the
-- admin's access can only come from the (fenced) admin branch.
INSERT INTO public.opportunity_stage_history (opportunity_id, from_stage, to_stage, event, created_by) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'qualify', 'propose', 'stage_change', '33333333-3333-3333-3333-333333333333'),
  ('00000000-0000-0000-0000-0000000000a2', 'qualify', 'propose', 'stage_change', '33333333-3333-3333-3333-333333333333');

INSERT INTO public.audit_log (table_name, row_id, operation, actor_source, new_data) VALUES
  ('opportunities', '00000000-0000-0000-0000-0000000000a1', 'UPDATE', 'system', '{"amount":100}'),
  ('opportunities', '00000000-0000-0000-0000-0000000000a2', 'UPDATE', 'system', '{"amount":999}'),
  ('opportunity_revenue_schedule', gen_random_uuid(), 'UPDATE', 'system', '{"opportunity_id":"00000000-0000-0000-0000-0000000000a2","amount":500}');

-- ══ Admin (non-member) is fenced out of the CONFIDENTIAL deal everywhere ══
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT is_empty($$ SELECT id FROM public.opportunity_revenue_schedule WHERE opportunity_id='00000000-0000-0000-0000-0000000000a2' $$,
  'SEC-1: admin cannot read Confidential revenue schedule');
SELECT is_empty($$ SELECT id FROM public.opportunity_stage_history WHERE opportunity_id='00000000-0000-0000-0000-0000000000a2' $$,
  'SEC-4: admin cannot read Confidential stage history');
SELECT is_empty($$ SELECT id FROM public.audit_log WHERE table_name='opportunities' AND row_id='00000000-0000-0000-0000-0000000000a2' $$,
  'SEC-2: admin cannot read Confidential opportunity audit rows');
SELECT is_empty($$ SELECT id FROM public.audit_log WHERE table_name='opportunity_revenue_schedule' AND new_data->>'opportunity_id'='00000000-0000-0000-0000-0000000000a2' $$,
  'SEC-2: admin cannot read Confidential revenue-schedule audit rows');
SELECT is_empty($$ UPDATE public.opportunities SET name='hacked' WHERE id='00000000-0000-0000-0000-0000000000a2' RETURNING id $$,
  'SEC-3: admin cannot UPDATE a Confidential opportunity');
SELECT is_empty($$ DELETE FROM public.opportunities WHERE id='00000000-0000-0000-0000-0000000000a2' RETURNING id $$,
  'SEC-3: admin cannot DELETE a Confidential opportunity');

-- ══ Fence does NOT over-restrict: admin keeps Standard-deal access ══
SELECT isnt_empty($$ SELECT id FROM public.opportunity_revenue_schedule WHERE opportunity_id='00000000-0000-0000-0000-0000000000a1' $$,
  'admin can read Standard revenue schedule');
SELECT isnt_empty($$ SELECT id FROM public.opportunity_stage_history WHERE opportunity_id='00000000-0000-0000-0000-0000000000a1' $$,
  'admin can read Standard stage history');
SELECT isnt_empty($$ SELECT id FROM public.audit_log WHERE table_name='opportunities' AND row_id='00000000-0000-0000-0000-0000000000a1' $$,
  'admin can read Standard opportunity audit rows');
SELECT isnt_empty($$ UPDATE public.opportunities SET name='ok' WHERE id='00000000-0000-0000-0000-0000000000a1' RETURNING id $$,
  'admin can UPDATE a Standard opportunity');

-- ══ Member (rep, owner) keeps access to their own Confidential deal ══
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT isnt_empty($$ SELECT id FROM public.opportunity_revenue_schedule WHERE opportunity_id='00000000-0000-0000-0000-0000000000a2' $$,
  'member can read their Confidential revenue schedule');
SELECT isnt_empty($$ SELECT id FROM public.opportunity_stage_history WHERE opportunity_id='00000000-0000-0000-0000-0000000000a2' $$,
  'SEC-4: entitled member can read Confidential stage history (via opportunity_visibility)');

SELECT * FROM finish();
ROLLBACK;
