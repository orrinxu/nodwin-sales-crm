-- supabase/tests/approval_write_path.test.sql
-- pgTAP: the approval write-path RPCs (ORR-604 Phase 1).
--   submit_opportunity_for_approval  — authz, per-entity workflow resolution,
--                                       step instantiation, duplicate guard.
--   record_approval_decision         — approver-role authz, sequential order,
--                                       approve-to-resolution, reject-resolution.
--
-- Step ids are captured with \gset as the service role (bypassing RLS) so the
-- decide-authorisation tests can pass a valid id regardless of the acting user's
-- read access. Status reads also run as the service role.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(17);

-- ── Fixtures ─────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('aa000000-0000-0000-0000-0000000000a1', 'admin@nodwin.com', '{"full_name":"Admin"}'),
  ('bb000000-0000-0000-0000-0000000000b1', 'rep@nodwin.com',   '{"full_name":"Rep Owner"}'),
  ('cc000000-0000-0000-0000-0000000000c1', 'mgr@nodwin.com',   '{"full_name":"Sales Mgr"}'),
  ('dd000000-0000-0000-0000-0000000000d1', 'fin@nodwin.com',   '{"full_name":"Finance"}'),
  ('ee000000-0000-0000-0000-0000000000e1', 'other@nodwin.com', '{"full_name":"Other Rep"}')
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name) VALUES
  ('e1000000-0000-0000-0000-0000000000e1', 'Entity One'),
  ('e2000000-0000-0000-0000-0000000000e2', 'Entity Two')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('aa000000-0000-0000-0000-0000000000a1', 'admin@nodwin.com', 'Admin',     'admin',         'e1000000-0000-0000-0000-0000000000e1'),
  ('bb000000-0000-0000-0000-0000000000b1', 'rep@nodwin.com',   'Rep Owner', 'sales_rep',     'e1000000-0000-0000-0000-0000000000e1'),
  ('cc000000-0000-0000-0000-0000000000c1', 'mgr@nodwin.com',   'Sales Mgr', 'sales_manager', 'e1000000-0000-0000-0000-0000000000e1'),
  ('dd000000-0000-0000-0000-0000000000d1', 'fin@nodwin.com',   'Finance',   'finance',       'e2000000-0000-0000-0000-0000000000e2'),
  ('ee000000-0000-0000-0000-0000000000e1', 'other@nodwin.com', 'Other Rep', 'sales_rep',     'e1000000-0000-0000-0000-0000000000e1')
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id) VALUES
  ('b1000000-0000-0000-0000-0000000000b1', 'BU One', 'e1000000-0000-0000-0000-0000000000e1', 'sales', 'cc000000-0000-0000-0000-0000000000c1'),
  ('b2000000-0000-0000-0000-0000000000b2', 'BU Two', 'e2000000-0000-0000-0000-0000000000e2', 'sales', 'cc000000-0000-0000-0000-0000000000c1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.accounts (id, name, account_owner_user_id, created_by)
VALUES ('a1000000-0000-0000-0000-0000000000a1', 'Acct', 'bb000000-0000-0000-0000-0000000000b1', 'bb000000-0000-0000-0000-0000000000b1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES
  ('01000000-0000-0000-0000-000000000001', 'Opp One',   'a1000000-0000-0000-0000-0000000000a1', 'qualify', 'bb000000-0000-0000-0000-0000000000b1', 'b1000000-0000-0000-0000-0000000000b1', 100000, 'USD', 'standard'),
  ('02000000-0000-0000-0000-000000000002', 'Opp Two',   'a1000000-0000-0000-0000-0000000000a1', 'qualify', 'bb000000-0000-0000-0000-0000000000b1', 'b2000000-0000-0000-0000-0000000000b2', 100000, 'USD', 'standard'),
  ('03000000-0000-0000-0000-000000000003', 'Opp Three', 'a1000000-0000-0000-0000-0000000000a1', 'qualify', 'bb000000-0000-0000-0000-0000000000b1', 'b1000000-0000-0000-0000-0000000000b1', 100000, 'USD', 'standard')
ON CONFLICT (id) DO NOTHING;

-- Entity Two's custom 2-step workflow: Sales Manager → Finance.
DO $$
DECLARE _wf uuid;
BEGIN
  INSERT INTO public.approval_workflows (name, entity_type, entity_id, active)
  VALUES ('Entity Two Opportunity Approval', 'opportunity', 'e2000000-0000-0000-0000-0000000000e2', true)
  RETURNING id INTO _wf;
  INSERT INTO public.approval_workflow_steps (workflow_id, step_order, approver_role) VALUES
    (_wf, 1, 'sales_manager'),
    (_wf, 2, 'finance');
END;
$$;

-- ── submit: authorisation ────────────────────────────────────────────────────
-- 1. A non-owner rep cannot submit someone else's opportunity.
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.submit_opportunity_for_approval('01000000-0000-0000-0000-000000000001')$$,
  '42501', NULL, 'non-owner cannot submit an opportunity for approval'
);

-- 2. The owner can submit their opportunity.
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.submit_opportunity_for_approval('01000000-0000-0000-0000-000000000001')$$,
  'owner can submit their opportunity for approval'
);

-- capture Opp One's step id (service role bypasses RLS)
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT s.id AS opp1_s1 FROM public.approval_steps s
  JOIN public.approval_instances i ON i.id = s.instance_id
  WHERE i.entity_id = '01000000-0000-0000-0000-000000000001' AND s.step_order = 1 \gset

-- 3. It created a pending instance...
SELECT is(
  (SELECT status::text FROM public.approval_instances WHERE entity_id = '01000000-0000-0000-0000-000000000001'),
  'pending', 'submit created a pending approval instance'
);
-- 4. ...with exactly one step (the org-wide default), approver_role sales_manager.
SELECT results_eq(
  $$SELECT step_order, approver_role::text FROM public.approval_steps s
    JOIN public.approval_instances i ON i.id = s.instance_id
    WHERE i.entity_id = '01000000-0000-0000-0000-000000000001' ORDER BY step_order$$,
  $$VALUES (1, 'sales_manager')$$,
  'default workflow instantiated one sales_manager step'
);

-- 5. Re-submitting while pending is blocked.
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.submit_opportunity_for_approval('01000000-0000-0000-0000-000000000001')$$,
  '23505', NULL, 'cannot submit an opportunity that already has a pending approval'
);

-- ── decide: authorisation + resolution ───────────────────────────────────────
-- 6. A rep without the step's role cannot decide it.
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'opp1_s1'),
  '42501', NULL, 'a non-approver role cannot decide the step'
);
-- 7. The sales manager (holds the step role) can approve it.
SELECT tests.as_user('mgr@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved', 'looks good')$$, :'opp1_s1'),
  'a sales_manager can approve the sales_manager step'
);
-- 8. The (single-step) instance is now approved.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status::text FROM public.approval_instances WHERE entity_id = '01000000-0000-0000-0000-000000000001'),
  'approved', 'approving the only step resolves the instance to approved'
);

-- ── per-entity workflow resolution + sequential multi-step ────────────────────
-- 9. Submitting Opp Two resolves Entity Two's 2-step workflow.
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.submit_opportunity_for_approval('02000000-0000-0000-0000-000000000002')$$,
  'owner can submit the Entity Two opportunity'
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
  'Entity Two resolved its own 2-step workflow (not the default)'
);
-- 10. Step 2 cannot be decided before step 1 (sequential).
SELECT tests.as_user('fin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'opp2_s2'),
  '23514', NULL, 'cannot decide step 2 while step 1 is pending'
);
-- 11. Manager approves step 1 — instance still pending (step 2 remains).
SELECT tests.as_user('mgr@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'opp2_s1'),
  'manager approves step 1 of the 2-step workflow'
);
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status::text FROM public.approval_instances WHERE entity_id = '02000000-0000-0000-0000-000000000002'),
  'pending', 'instance stays pending until all steps are approved'
);
-- 12. Finance approves step 2 — instance resolves to approved.
SELECT tests.as_user('fin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'opp2_s2'),
  'finance approves step 2'
);
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status::text FROM public.approval_instances WHERE entity_id = '02000000-0000-0000-0000-000000000002'),
  'approved', 'approving the final step resolves the instance'
);

-- ── reject path ──────────────────────────────────────────────────────────────
-- 13. Submit Opp Three, manager rejects → instance rejected.
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT public.submit_opportunity_for_approval('03000000-0000-0000-0000-000000000003');

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT s.id AS opp3_s1 FROM public.approval_steps s
  JOIN public.approval_instances i ON i.id = s.instance_id
  WHERE i.entity_id = '03000000-0000-0000-0000-000000000003' AND s.step_order = 1 \gset

SELECT tests.as_user('mgr@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.record_approval_decision(%L, 'rejected', 'numbers do not work')$$, :'opp3_s1'),
  'manager can reject a step'
);
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status::text FROM public.approval_instances WHERE entity_id = '03000000-0000-0000-0000-000000000003'),
  'rejected', 'a rejection resolves the instance to rejected'
);

SELECT * FROM finish();

ROLLBACK;
