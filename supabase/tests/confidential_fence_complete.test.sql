-- supabase/tests/confidential_fence_complete.test.sql
-- pgTAP: the Confidential-tier admin fence is CENTRALIZED and COMPLETE (ORR-692).
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- Two layers:
--   A. STRUCTURAL INVARIANT (the regression guard): catalog-driven — every
--      opportunity-child table (any table with an opportunity_id column) has RLS
--      enabled, and every policy on it that has an admin branch references the
--      canonical fence (opportunity_is_confidential) or a fence helper whose body
--      does. Adding a NEW child table with an unfenced admin branch fails this test
--      automatically, with no test edit required.
--   B. BEHAVIOURAL: a non-member admin cannot READ or WRITE a Confidential deal's
--      children (splits/team/stage-history/activities/documents/cashflow milestones/
--      chunks/visibility/approvals/audit rows), while Standard deals stay
--      admin-writable and members keep their access.
--
-- Run with: supabase test db

BEGIN;

SELECT no_plan();

-- ═══════════════════════════════════════════════════════════════════════════════
-- A. STRUCTURAL INVARIANT — the regression guard
-- ═══════════════════════════════════════════════════════════════════════════════

-- A1. Every opportunity-child base table has RLS enabled.
SELECT is(
  (SELECT count(*)::int
     FROM information_schema.columns col
     JOIN pg_class c   ON c.relname = col.table_name
     JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE col.table_schema = 'public'
      AND col.column_name = 'opportunity_id'
      AND c.relkind = 'r'
      AND c.relrowsecurity = false),
  0,
  'A1: every opportunity-child table has RLS enabled'
);

-- A2. No opportunity-child policy has an admin branch without a confidential fence.
-- An admin branch = references current_user_role()/'admin'. A fenced policy also
-- references opportunity_is_confidential, or delegates to a whitelisted fence
-- helper (asserted fenced in A3). This is THE guard against the next unfenced child.
SELECT is(
  (SELECT count(*)::int FROM (
     SELECT p.tablename, p.policyname
       FROM pg_policies p
      WHERE p.schemaname = 'public'
        AND p.tablename IN (
          SELECT c.relname
            FROM information_schema.columns col
            JOIN pg_class c ON c.relname = col.table_name
            JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
           WHERE col.table_schema = 'public' AND col.column_name = 'opportunity_id' AND c.relkind = 'r'
        )
        AND (COALESCE(p.qual,'') || COALESCE(p.with_check,'')) ~* '(current_user_role|''admin'')'
        AND (COALESCE(p.qual,'') || COALESCE(p.with_check,''))
              !~* 'opportunity_is_confidential|can_access_opportunity_schedule|can_read_approval_instance'
   ) unfenced),
  0,
  'A2: every opportunity-child policy with an admin branch references the confidential fence'
);

-- A3. The fence helpers that policies delegate to actually contain the fence
-- (so the A2 whitelist cannot become a loophole).
SELECT ok(
  pg_get_functiondef('public.can_access_opportunity_schedule(uuid)'::regprocedure) ~* 'opportunity_is_confidential',
  'A3: can_access_opportunity_schedule fences confidential'
);
SELECT ok(
  pg_get_functiondef('public.can_read_approval_instance(uuid)'::regprocedure) ~* 'opportunity_is_confidential',
  'A3: can_read_approval_instance fences confidential'
);
SELECT ok(
  pg_get_functiondef('public.audit_row_is_confidential(text,uuid,jsonb,jsonb)'::regprocedure) ~* 'opportunity_is_confidential',
  'A3: audit_row_is_confidential fences confidential'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- B. BEHAVIOURAL — fixtures
-- ═══════════════════════════════════════════════════════════════════════════════
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

-- Confidential-deal children for the read-mask assertions.
INSERT INTO public.cashflow_milestone (opportunity_id, direction, label, scheduled_month, amount, currency, created_by) VALUES
  ('00000000-0000-0000-0000-0000000000a2', 'out', 'Secret payout', '2026-02-01', 500, 'USD', '11111111-1111-1111-1111-111111111111');
INSERT INTO public.opportunity_splits (opportunity_id, sales_unit_id, user_id, pct) VALUES
  ('00000000-0000-0000-0000-0000000000a2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 100);

-- audit_log rows: a cashflow_milestone change on the Confidential deal (the exact
-- regression — a child NOT in the old hardcoded audit list).
INSERT INTO public.audit_log (table_name, row_id, operation, actor_source, new_data) VALUES
  ('cashflow_milestone', gen_random_uuid(), 'INSERT', 'system', '{"opportunity_id":"00000000-0000-0000-0000-0000000000a2","amount":500,"label":"Secret payout"}');

-- ══ Admin (non-member) is fenced out of the CONFIDENTIAL deal ══
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;

-- Reads
SELECT is_empty($$ SELECT id FROM public.cashflow_milestone WHERE opportunity_id='00000000-0000-0000-0000-0000000000a2' $$,
  'B: admin cannot read Confidential cashflow milestones');
SELECT is_empty($$ SELECT id FROM public.audit_log WHERE table_name='cashflow_milestone' AND new_data->>'opportunity_id'='00000000-0000-0000-0000-0000000000a2' $$,
  'B: admin cannot read Confidential cashflow_milestone audit rows (centralized fence)');
SELECT is_empty($$ SELECT opportunity_id FROM public.opportunity_visibility WHERE opportunity_id='00000000-0000-0000-0000-0000000000a2' AND user_id<>'22222222-2222-2222-2222-222222222222' $$,
  'B: admin cannot read Confidential deal membership rows');

-- Writes (tamper) — all must be blocked on the Confidential deal. A blocked INSERT
-- violates the WITH CHECK and raises 42501; a blocked DELETE simply filters to zero
-- rows (RLS USING) and affects nothing.
SELECT throws_ok($$ INSERT INTO public.cashflow_milestone (opportunity_id, direction, label, scheduled_month, amount, currency, created_by) VALUES ('00000000-0000-0000-0000-0000000000a2','in','x','2026-03-01',1,'USD','22222222-2222-2222-2222-222222222222') $$,
  '42501', NULL, 'B: admin cannot INSERT a cashflow milestone on a Confidential deal');
-- user_id is the OWNER (not the admin), so the author branch (user_id = auth.uid())
-- does not apply — this exercises the fenced admin branch specifically.
SELECT throws_ok($$ INSERT INTO public.activities (opportunity_id, user_id, type, subject) VALUES ('00000000-0000-0000-0000-0000000000a2','11111111-1111-1111-1111-111111111111','note','hack') $$,
  '42501', NULL, 'B: admin cannot INSERT an activity (as another user) on a Confidential deal');
SELECT is_empty($$ DELETE FROM public.opportunity_splits WHERE opportunity_id='00000000-0000-0000-0000-0000000000a2' RETURNING id $$,
  'B: admin cannot DELETE splits on a Confidential deal');
SELECT throws_ok($$ SELECT public.replace_opportunity_splits('00000000-0000-0000-0000-0000000000a2', '[]'::jsonb) $$,
  '42501', NULL, 'B: replace_opportunity_splits RPC rejects a Confidential deal');
SELECT throws_ok($$ SELECT public.replace_opportunity_team_members('00000000-0000-0000-0000-0000000000a2', '[]'::jsonb) $$,
  '42501', NULL, 'B: replace_opportunity_team_members RPC rejects a Confidential deal');

-- ══ Fence does NOT over-restrict: admin keeps STANDARD-deal write access ══
SELECT isnt_empty($$ INSERT INTO public.activities (opportunity_id, user_id, type, subject) VALUES ('00000000-0000-0000-0000-0000000000a1','22222222-2222-2222-2222-222222222222','note','ok') RETURNING id $$,
  'B: admin CAN insert an activity on a Standard deal');
SELECT lives_ok($$ SELECT public.replace_opportunity_splits('00000000-0000-0000-0000-0000000000a1', '[]'::jsonb) $$,
  'B: replace_opportunity_splits RPC works on a Standard deal');

-- ══ Member (owner) keeps access to their own Confidential deal ══
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty($$ SELECT id FROM public.cashflow_milestone WHERE opportunity_id='00000000-0000-0000-0000-0000000000a2' $$,
  'B: owner can read their Confidential cashflow milestones');

SELECT * FROM finish();
ROLLBACK;
