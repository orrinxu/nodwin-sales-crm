-- supabase/tests/direct_reports_self_service.test.sql
-- pgTAP tests for the direct-reports self-service roster (ORR-715 / T-141).
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Proves the scoped relaxation of the manager_user_id guard cannot be abused:
-- a manager can only claim/release sales_reps in their own entity(+BU); cannot
-- reach other entities/BUs, non-reps, or escalate roles; reps cannot self-serve;
-- reassignment surfaces the losing manager; membership is effective-dated; the
-- reparent recompute fans out over the subtree; and Confidential is unaffected.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(21);

-- ── Fixtures (as service role) ───────────────────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a0000000-0000-0000-0000-000000000008', 'adm@n.com',  '{"full_name":"Admin"}'),
  ('f1000000-0000-0000-0000-000000000001', 'm@n.com',    '{"full_name":"Manager M"}'),
  ('f2000000-0000-0000-0000-000000000002', 'm2@n.com',   '{"full_name":"Manager M2"}'),
  ('fa000000-0000-0000-0000-000000000003', 'r@n.com',    '{"full_name":"Regional R"}'),
  ('aa000000-0000-0000-0000-000000000004', 'a@n.com',    '{"full_name":"Rep A"}'),
  ('bb000000-0000-0000-0000-000000000005', 'b@n.com',    '{"full_name":"Rep B"}'),
  ('cc000000-0000-0000-0000-000000000006', 'c@n.com',    '{"full_name":"Rep C"}'),
  ('55000000-0000-0000-0000-000000000007', 'sub@n.com',  '{"full_name":"Rep Sub"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.entities (id, name) VALUES
  ('e1000000-0000-0000-0000-0000000000e1', 'Entity 1'),
  ('e2000000-0000-0000-0000-0000000000e2', 'Entity 2')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_units (id, name, entity_id, kind) VALUES
  ('b1000000-0000-0000-0000-0000000000b1', 'BU1', 'e1000000-0000-0000-0000-0000000000e1', 'sales'),
  ('b2000000-0000-0000-0000-0000000000b2', 'BU2', 'e1000000-0000-0000-0000-0000000000e1', 'sales')
ON CONFLICT (id) DO NOTHING;

-- M: sales_manager in E1/BU1. M2: sales_manager E1/BU1. R: regional_head E1, no BU.
-- A: rep E1/BU1 (M-manageable). B: rep E1/BU2 (not M, yes R). C: rep E2 (neither).
-- Sub: rep E1/BU1, initially reports to A (for the fan-out test).
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id, primary_business_unit_id, manager_user_id) VALUES
  ('a0000000-0000-0000-0000-000000000008', 'adm@n.com', 'Admin',     'admin',            'e1000000-0000-0000-0000-0000000000e1', NULL, NULL),
  ('f1000000-0000-0000-0000-000000000001', 'm@n.com',   'Manager M', 'sales_manager',    'e1000000-0000-0000-0000-0000000000e1', 'b1000000-0000-0000-0000-0000000000b1', NULL),
  ('f2000000-0000-0000-0000-000000000002', 'm2@n.com',  'Manager M2','sales_manager',    'e1000000-0000-0000-0000-0000000000e1', 'b1000000-0000-0000-0000-0000000000b1', NULL),
  ('fa000000-0000-0000-0000-000000000003', 'r@n.com',   'Regional R','regional_head',    'e1000000-0000-0000-0000-0000000000e1', NULL, NULL),
  ('aa000000-0000-0000-0000-000000000004', 'a@n.com',   'Rep A',     'sales_rep',        'e1000000-0000-0000-0000-0000000000e1', 'b1000000-0000-0000-0000-0000000000b1', NULL),
  ('bb000000-0000-0000-0000-000000000005', 'b@n.com',   'Rep B',     'sales_rep',        'e1000000-0000-0000-0000-0000000000e1', 'b2000000-0000-0000-0000-0000000000b2', NULL),
  ('cc000000-0000-0000-0000-000000000006', 'c@n.com',   'Rep C',     'sales_rep',        'e2000000-0000-0000-0000-0000000000e2', NULL, NULL),
  ('55000000-0000-0000-0000-000000000007', 'sub@n.com', 'Rep Sub',   'sales_rep',        'e1000000-0000-0000-0000-0000000000e1', 'b1000000-0000-0000-0000-0000000000b1', 'aa000000-0000-0000-0000-000000000004')
ON CONFLICT (id) DO UPDATE SET
  primary_role = EXCLUDED.primary_role, primary_entity_id = EXCLUDED.primary_entity_id,
  primary_business_unit_id = EXCLUDED.primary_business_unit_id, manager_user_id = EXCLUDED.manager_user_id;

INSERT INTO public.accounts (id, name, email_domains)
VALUES ('ac000000-0000-0000-0000-0000000000ac', 'Acct', ARRAY['x.com']) ON CONFLICT (id) DO NOTHING;

-- Standard deals: D1 owned by A, D2 owned by Sub (subtree). CONF owned by A.
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES
  ('d1000000-0000-0000-0000-0000000000d1', 'Deal One', 'ac000000-0000-0000-0000-0000000000ac', 'qualify', 'aa000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-0000000000b1', 100000, 'USD', 'standard'),
  ('d2000000-0000-0000-0000-0000000000d2', 'Deal Two', 'ac000000-0000-0000-0000-0000000000ac', 'qualify', '55000000-0000-0000-0000-000000000007', 'b1000000-0000-0000-0000-0000000000b1', 200000, 'USD', 'standard'),
  ('cf000000-0000-0000-0000-0000000000cf', 'Conf Deal','ac000000-0000-0000-0000-0000000000ac', 'qualify', 'aa000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-0000000000b1', 300000, 'USD', 'confidential')
ON CONFLICT (id) DO NOTHING;

-- ── 1-6. Capability predicate ────────────────────────────────────────────────
SELECT ok(public.can_manage_direct_report('f1000000-0000-0000-0000-000000000001','aa000000-0000-0000-0000-000000000004'), 'M can manage A (same entity+BU)');
SELECT ok(NOT public.can_manage_direct_report('f1000000-0000-0000-0000-000000000001','bb000000-0000-0000-0000-000000000005'), 'M cannot manage B (different BU)');
SELECT ok(NOT public.can_manage_direct_report('f1000000-0000-0000-0000-000000000001','cc000000-0000-0000-0000-000000000006'), 'M cannot manage C (different entity)');
SELECT ok(public.can_manage_direct_report('fa000000-0000-0000-0000-000000000003','aa000000-0000-0000-0000-000000000004'), 'R (regional, no BU) can manage A (same entity)');
SELECT ok(NOT public.can_manage_direct_report('fa000000-0000-0000-0000-000000000003','cc000000-0000-0000-0000-000000000006'), 'R cannot manage C (different entity)');
SELECT ok(NOT public.can_manage_direct_report('f1000000-0000-0000-0000-000000000001','f2000000-0000-0000-0000-000000000002'), 'M cannot manage M2 (target is not a sales_rep)');

-- ── 7-8. Manager claims a rep + effective-dated history opens ─────────────────
SELECT tests.as_user('m@n.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT public.assign_direct_report('aa000000-0000-0000-0000-000000000004') $$, 'M claims A');

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is((SELECT manager_user_id FROM public.users WHERE id='aa000000-0000-0000-0000-000000000004'),
          'f1000000-0000-0000-0000-000000000001'::uuid, 'A now reports to M');
SELECT ok(EXISTS(SELECT 1 FROM public.manager_assignment_history
                  WHERE report_user_id='aa000000-0000-0000-0000-000000000004'
                    AND manager_user_id='f1000000-0000-0000-0000-000000000001' AND effective_to IS NULL),
          'an open history period (A -> M) was recorded');

-- ── 9-11. Scope + role guardrails via the RPC ────────────────────────────────
SELECT tests.as_user('m@n.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.assign_direct_report('bb000000-0000-0000-0000-000000000005') $$, '42501', NULL, 'M cannot claim B (different BU)');
SELECT throws_ok($$ SELECT public.assign_direct_report('cc000000-0000-0000-0000-000000000006') $$, '42501', NULL, 'M cannot claim C (different entity)');

SELECT tests.as_user('a@n.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.assign_direct_report('55000000-0000-0000-0000-000000000007') $$, '42501', NULL, 'a rep cannot self-serve a roster');

-- ── 12-13. Escalation guard still blocks own-row abuse (RLS allows own-row UPDATE) ──
SELECT tests.as_user('m@n.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ UPDATE public.users SET manager_user_id='fa000000-0000-0000-0000-000000000003' WHERE id='f1000000-0000-0000-0000-000000000001' $$, '42501', NULL, 'M cannot change their OWN manager via self-serve');
SELECT throws_ok($$ UPDATE public.users SET primary_role='exec' WHERE id='f1000000-0000-0000-0000-000000000001' $$, '42501', NULL, 'M cannot escalate their own role');

-- ── 14-15. Reassignment surfaces the losing manager ──────────────────────────
SELECT tests.as_user('m2@n.com');
SET LOCAL ROLE authenticated;
SELECT is(((SELECT public.assign_direct_report('aa000000-0000-0000-0000-000000000004'))->>'losing_manager_id')::uuid,
          'f1000000-0000-0000-0000-000000000001'::uuid, 'reassigning A to M2 returns M as the losing manager');

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is((SELECT manager_user_id FROM public.users WHERE id='aa000000-0000-0000-0000-000000000004'),
          'f2000000-0000-0000-0000-000000000002'::uuid, 'A now reports to M2');

-- ── 16-18. Release semantics ─────────────────────────────────────────────────
SELECT tests.as_user('m@n.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$ SELECT public.remove_direct_report('aa000000-0000-0000-0000-000000000004') $$, '42501', NULL, 'M cannot release A (A reports to M2 now, not M)');

SELECT tests.as_user('m2@n.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok($$ SELECT public.remove_direct_report('aa000000-0000-0000-0000-000000000004') $$, 'M2 releases A');

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT ok(NOT EXISTS(SELECT 1 FROM public.manager_assignment_history
                      WHERE report_user_id='aa000000-0000-0000-0000-000000000004' AND effective_to IS NULL),
          'after release, no open history period remains for A');

-- ── 19. Reparent fan-out: moving A to M gives M visibility of Sub''s deal too ──
UPDATE public.users SET manager_user_id='f1000000-0000-0000-0000-000000000001' WHERE id='aa000000-0000-0000-0000-000000000004';
SELECT ok(EXISTS(SELECT 1 FROM public.opportunity_visibility
                  WHERE opportunity_id='d2000000-0000-0000-0000-0000000000d2'
                    AND user_id='f1000000-0000-0000-0000-000000000001'),
          'reparent fans out: M sees the subordinate (Sub) deal, not just A''s own');

-- ── 20. Confidential unaffected: manager chain is standard-tier only ─────────
SELECT ok(NOT EXISTS(SELECT 1 FROM public.opportunity_visibility
                      WHERE opportunity_id='cf000000-0000-0000-0000-0000000000cf'
                        AND user_id='f1000000-0000-0000-0000-000000000001'),
          'manager does NOT gain visibility of a subordinate Confidential deal');

SELECT * FROM finish();
ROLLBACK;
