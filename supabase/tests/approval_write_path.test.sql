-- supabase/tests/approval_write_path.test.sql
-- pgTAP: approval write path under the Phase-3a approver model (ORR-604).
--   * org-wide default = the submitter's MANAGER (resolved at submit).
--   * role-based steps are ENTITY-FIREWALLED (a role holder may only decide
--     approvals for opportunities in their own entity).
--   * a submitter with no manager escalates to admin.
--
-- Step ids captured via \gset as the service role (bypasses RLS).
-- Run with: supabase test db

BEGIN;

SELECT plan(21);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aa000000-0000-0000-0000-0000000000a1', 'admin@nodwin.com', '{"full_name":"Admin"}'),
  ('bb000000-0000-0000-0000-0000000000b1', 'rep@nodwin.com',   '{"full_name":"Rep"}'),
  ('cc000000-0000-0000-0000-0000000000c1', 'mgr@nodwin.com',   '{"full_name":"E1 Mgr"}'),
  ('dd000000-0000-0000-0000-0000000000d1', 'fin@nodwin.com',   '{"full_name":"E2 Finance"}'),
  ('ee000000-0000-0000-0000-0000000000e1', 'other@nodwin.com', '{"full_name":"Other Rep"}'),
  ('ff000000-0000-0000-0000-0000000000f1', 'mgr2@nodwin.com',  '{"full_name":"E2 Mgr"}')
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name) VALUES
  ('e1000000-0000-0000-0000-0000000000e1', 'Entity One'),
  ('e2000000-0000-0000-0000-0000000000e2', 'Entity Two')
ON CONFLICT (id) DO NOTHING;

-- rep's manager is the E1 manager. other has NO manager (tests admin fallback).
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id, manager_user_id) VALUES
  ('aa000000-0000-0000-0000-0000000000a1', 'admin@nodwin.com', 'Admin',      'admin',         'e1000000-0000-0000-0000-0000000000e1', NULL),
  ('bb000000-0000-0000-0000-0000000000b1', 'rep@nodwin.com',   'Rep',        'sales_rep',     'e1000000-0000-0000-0000-0000000000e1', 'cc000000-0000-0000-0000-0000000000c1'),
  ('cc000000-0000-0000-0000-0000000000c1', 'mgr@nodwin.com',   'E1 Mgr',     'sales_manager', 'e1000000-0000-0000-0000-0000000000e1', NULL),
  ('dd000000-0000-0000-0000-0000000000d1', 'fin@nodwin.com',   'E2 Finance', 'finance',       'e2000000-0000-0000-0000-0000000000e2', NULL),
  ('ee000000-0000-0000-0000-0000000000e1', 'other@nodwin.com', 'Other Rep',  'sales_rep',     'e1000000-0000-0000-0000-0000000000e1', NULL),
  ('ff000000-0000-0000-0000-0000000000f1', 'mgr2@nodwin.com',  'E2 Mgr',     'sales_manager', 'e2000000-0000-0000-0000-0000000000e2', NULL)
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role, manager_user_id = EXCLUDED.manager_user_id, primary_entity_id = EXCLUDED.primary_entity_id;

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id) VALUES
  ('b1000000-0000-0000-0000-0000000000b1', 'BU One', 'e1000000-0000-0000-0000-0000000000e1', 'sales', 'cc000000-0000-0000-0000-0000000000c1'),
  ('b2000000-0000-0000-0000-0000000000b2', 'BU Two', 'e2000000-0000-0000-0000-0000000000e2', 'sales', 'ff000000-0000-0000-0000-0000000000f1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.accounts (id, name, account_owner_user_id, created_by)
VALUES ('a1000000-0000-0000-0000-0000000000a1', 'Acct', 'bb000000-0000-0000-0000-0000000000b1', 'bb000000-0000-0000-0000-0000000000b1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES
  ('01000000-0000-0000-0000-000000000001', 'Opp One',   'a1000000-0000-0000-0000-0000000000a1', 'qualify', 'bb000000-0000-0000-0000-0000000000b1', 'b1000000-0000-0000-0000-0000000000b1', 100000, 'USD', 'standard'),
  ('02000000-0000-0000-0000-000000000002', 'Opp Two',   'a1000000-0000-0000-0000-0000000000a1', 'qualify', 'bb000000-0000-0000-0000-0000000000b1', 'b2000000-0000-0000-0000-0000000000b2', 100000, 'USD', 'standard'),
  ('03000000-0000-0000-0000-000000000003', 'Opp Three', 'a1000000-0000-0000-0000-0000000000a1', 'qualify', 'ee000000-0000-0000-0000-0000000000e1', 'b1000000-0000-0000-0000-0000000000b1', 100000, 'USD', 'standard')
ON CONFLICT (id) DO NOTHING;

-- Entity Two custom 2-step ROLE workflow: Sales Manager → Finance.
DO $$
DECLARE _wf uuid;
BEGIN
  INSERT INTO public.approval_workflows (name, entity_type, entity_id, active)
  VALUES ('E2 Opp Approval', 'opportunity', 'e2000000-0000-0000-0000-0000000000e2', true)
  RETURNING id INTO _wf;
  INSERT INTO public.approval_workflow_steps (workflow_id, step_order, approver_kind, approver_role) VALUES
    (_wf, 1, 'role', 'sales_manager'),
    (_wf, 2, 'role', 'finance');
END $$;

-- ── Default workflow = submitter's manager ───────────────────────────────────
-- 1. Non-owner cannot submit.
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.submit_opportunity_for_approval('01000000-0000-0000-0000-000000000001')$$,
  '42501', NULL, 'non-owner cannot submit'
);

-- 2. Owner submits Opp One (E1) — default workflow.
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.submit_opportunity_for_approval('01000000-0000-0000-0000-000000000001')$$,
  'owner submits opp one'
);

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT s.id AS opp1_s1 FROM public.approval_steps s
  JOIN public.approval_instances i ON i.id = s.instance_id
  WHERE i.entity_id = '01000000-0000-0000-0000-000000000001' AND s.step_order = 1 \gset

-- 3. The step resolved to the submitter's MANAGER (named-user), not a role.
SELECT results_eq(
  $$SELECT approver_user_id, approver_role FROM public.approval_steps s
    JOIN public.approval_instances i ON i.id = s.instance_id
    WHERE i.entity_id = '01000000-0000-0000-0000-000000000001'$$,
  $$VALUES ('cc000000-0000-0000-0000-0000000000c1'::uuid, NULL::public.user_role)$$,
  'default workflow resolved the submitter''s manager'
);
-- 4. The instance recorded the opportunity's business entity.
SELECT is(
  (SELECT business_entity_id FROM public.approval_instances WHERE entity_id = '01000000-0000-0000-0000-000000000001'),
  'e1000000-0000-0000-0000-0000000000e1'::uuid, 'instance recorded the business entity'
);
-- 5. Duplicate submit blocked.
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.submit_opportunity_for_approval('01000000-0000-0000-0000-000000000001')$$,
  '23505', NULL, 'duplicate submit blocked'
);
-- 6. A non-manager cannot decide the manager step.
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'opp1_s1'),
  '42501', NULL, 'a non-approver cannot decide the manager step'
);
-- 7. The manager approves.
SELECT tests.as_user('mgr@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'opp1_s1'),
  'the submitter''s manager approves'
);
-- 8. Instance approved.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status::text FROM public.approval_instances WHERE entity_id = '01000000-0000-0000-0000-000000000001'),
  'approved', 'manager approval resolves the instance'
);

-- ── Entity-firewalled role workflow (Opp Two, E2) ────────────────────────────
-- 9. Owner submits Opp Two (E2) — resolves the 2-step role workflow.
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.submit_opportunity_for_approval('02000000-0000-0000-0000-000000000002')$$,
  'owner submits opp two'
);
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT s.id AS opp2_s1 FROM public.approval_steps s
  JOIN public.approval_instances i ON i.id = s.instance_id
  WHERE i.entity_id = '02000000-0000-0000-0000-000000000002' AND s.step_order = 1 \gset
SELECT s.id AS opp2_s2 FROM public.approval_steps s
  JOIN public.approval_instances i ON i.id = s.instance_id
  WHERE i.entity_id = '02000000-0000-0000-0000-000000000002' AND s.step_order = 2 \gset
SELECT results_eq(
  $$SELECT step_order, approver_role::text FROM public.approval_steps s
    JOIN public.approval_instances i ON i.id = s.instance_id
    WHERE i.entity_id = '02000000-0000-0000-0000-000000000002' ORDER BY step_order$$,
  $$VALUES (1, 'sales_manager'), (2, 'finance')$$,
  'E2 workflow instantiated its 2 role steps'
);
-- 10. FIREWALL: an E1 sales_manager cannot decide an E2 role step.
SELECT tests.as_user('mgr@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'opp2_s1'),
  '42501', NULL, 'a sales_manager from another entity cannot decide (firewalled)'
);
-- 11. Sequential: E2 finance cannot decide step 2 before step 1.
SELECT tests.as_user('fin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'opp2_s2'),
  '23514', NULL, 'cannot decide step 2 before step 1'
);
-- 12. The E2 sales_manager approves step 1.
SELECT tests.as_user('mgr2@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'opp2_s1'),
  'the E2 sales_manager approves step 1'
);
-- 13. E2 finance approves step 2 → instance approved.
SELECT tests.as_user('fin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'opp2_s2'),
  'the E2 finance approves step 2'
);
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status::text FROM public.approval_instances WHERE entity_id = '02000000-0000-0000-0000-000000000002'),
  'approved', 'both role steps approved resolves the instance'
);

-- ── No-manager submitter escalates to admin ──────────────────────────────────
-- 14. 'other' has no manager; submitting resolves the default step to admin role.
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.submit_opportunity_for_approval('03000000-0000-0000-0000-000000000003')$$,
  'a manager-less submitter can still submit'
);
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT s.id AS opp3_s1 FROM public.approval_steps s
  JOIN public.approval_instances i ON i.id = s.instance_id
  WHERE i.entity_id = '03000000-0000-0000-0000-000000000003' AND s.step_order = 1 \gset
SELECT results_eq(
  $$SELECT approver_role::text, approver_user_id FROM public.approval_steps s
    JOIN public.approval_instances i ON i.id = s.instance_id
    WHERE i.entity_id = '03000000-0000-0000-0000-000000000003'$$,
  $$VALUES ('admin', NULL::uuid)$$,
  'no-manager step escalates to admin role'
);
-- 15. Admin approves it.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'opp3_s1'),
  'admin approves the escalated step'
);
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status::text FROM public.approval_instances WHERE entity_id = '03000000-0000-0000-0000-000000000003'),
  'approved', 'admin approval resolves the escalated instance'
);

-- ── Firewall fails CLOSED when the instance has no business entity ───────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.approval_instances (id, workflow_id, entity_type, entity_id, business_entity_id, status, triggered_by_user_id)
VALUES ('0f000000-0000-0000-0000-00000000000f',
  (SELECT id FROM public.approval_workflows WHERE entity_type = 'opportunity' AND entity_id IS NULL LIMIT 1),
  'opportunity', '01000000-0000-0000-0000-000000000001', NULL, 'pending', 'bb000000-0000-0000-0000-0000000000b1');
INSERT INTO public.approval_steps (id, instance_id, step_order, approver_role, status)
VALUES ('0f000000-0000-0000-0000-0000000000ff', '0f000000-0000-0000-0000-00000000000f', 1, 'sales_manager', 'pending');

-- 16. A role holder cannot decide a role step whose instance has NO business
--     entity (firewall fails closed).
SELECT tests.as_user('mgr2@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.record_approval_decision('0f000000-0000-0000-0000-0000000000ff', 'approved')$$,
  '42501', NULL, 'role approver denied on a no-business-entity instance (fails closed)'
);
-- 17. Admin can still decide it.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.record_approval_decision('0f000000-0000-0000-0000-0000000000ff', 'approved')$$,
  'admin can still decide a no-business-entity step'
);

SELECT * FROM finish();

ROLLBACK;
