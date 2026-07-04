-- supabase/tests/approval_decision_rpc.test.sql
-- pgTAP tests for record_approval_decision RPC — multi-approver authz + aggregation.
-- (ORR-639)
--
-- HIGH-RISK FILE — see AGENTS.md §6.

BEGIN;

SELECT plan(27);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Test fixtures
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO auth.users (id, email, role, instance_id, aud)
VALUES
  ('c1000000-0000-0000-0000-000000000001', 'admin@nodwin.test',      'authenticated', '00000000-0000-0000-0000-000000000000', 'authenticated'),
  ('c1000000-0000-0000-0000-000000000002', 'rep@nodwin.test',        'authenticated', '00000000-0000-0000-0000-000000000000', 'authenticated'),
  ('c1000000-0000-0000-0000-000000000003', 'approver1@nodwin.test',  'authenticated', '00000000-0000-0000-0000-000000000000', 'authenticated'),
  ('c1000000-0000-0000-0000-000000000004', 'approver2@nodwin.test',  'authenticated', '00000000-0000-0000-0000-000000000000', 'authenticated'),
  ('c1000000-0000-0000-0000-000000000005', 'outsider@nodwin.test',   'authenticated', '00000000-0000-0000-0000-000000000000', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, primary_role, primary_entity_id)
VALUES
  ('c1000000-0000-0000-0000-000000000001', 'admin@nodwin.test',     'admin',         NULL),
  ('c1000000-0000-0000-0000-000000000002', 'rep@nodwin.test',       'sales_rep',     NULL),
  ('c1000000-0000-0000-0000-000000000003', 'approver1@nodwin.test', 'sales_manager', NULL),
  ('c1000000-0000-0000-0000-000000000004', 'approver2@nodwin.test', 'regional_head', NULL),
  ('c1000000-0000-0000-0000-000000000005', 'outsider@nodwin.test',  'sales_rep',     NULL)
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();

-- Workflow
INSERT INTO public.approval_workflows (id, name, entity_type, active)
VALUES ('c2000000-0000-0000-0000-000000000001', 'Test Decision RPC Workflow', 'opportunity', true)
ON CONFLICT (id) DO NOTHING;

-- Instance 1: any_one step with 2 approvers in array
INSERT INTO public.approval_instances (id, workflow_id, entity_type, entity_id, status, triggered_by_user_id)
VALUES ('c4000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'opportunity',
        '00000000-0000-0000-0000-000000000001', 'pending', 'c1000000-0000-0000-0000-000000000002');

-- Instance 2: all_required step with 2 approvers
INSERT INTO public.approval_instances (id, workflow_id, entity_type, entity_id, status, triggered_by_user_id)
VALUES ('c4000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000001', 'opportunity',
        '00000000-0000-0000-0000-000000000002', 'pending', 'c1000000-0000-0000-0000-000000000002');

-- Instance 3: already resolved step
INSERT INTO public.approval_instances (id, workflow_id, entity_type, entity_id, status, triggered_by_user_id)
VALUES ('c4000000-0000-0000-0000-000000000003', 'c2000000-0000-0000-0000-000000000001', 'opportunity',
        '00000000-0000-0000-0000-000000000003', 'pending', 'c1000000-0000-0000-0000-000000000002');

-- Instance 4: two any_one steps (for instance resolution test)
INSERT INTO public.approval_instances (id, workflow_id, entity_type, entity_id, status, triggered_by_user_id)
VALUES ('c4000000-0000-0000-0000-000000000004', 'c2000000-0000-0000-0000-000000000001', 'opportunity',
        '00000000-0000-0000-0000-000000000004', 'pending', 'c1000000-0000-0000-0000-000000000002');

-- Steps for instance 1: any_one with 2 approvers
INSERT INTO public.approval_steps (id, instance_id, step_order, approver_user_ids, mode)
VALUES ('c5000000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 1,
        ARRAY['c1000000-0000-0000-0000-000000000003'::uuid, 'c1000000-0000-0000-0000-000000000004'::uuid], 'any_one');

-- Steps for instance 2: all_required with 2 approvers
INSERT INTO public.approval_steps (id, instance_id, step_order, approver_user_ids, mode)
VALUES ('c5000000-0000-0000-0000-000000000002', 'c4000000-0000-0000-0000-000000000002', 1,
        ARRAY['c1000000-0000-0000-0000-000000000003'::uuid, 'c1000000-0000-0000-0000-000000000004'::uuid], 'all_required');

-- Step for instance 3: already resolved
INSERT INTO public.approval_steps (id, instance_id, step_order, approver_user_ids, mode, status)
VALUES ('c5000000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000003', 1,
        ARRAY['c1000000-0000-0000-0000-000000000003'::uuid], 'any_one', 'approved');

-- Steps for instance 4: two any_one steps
INSERT INTO public.approval_steps (id, instance_id, step_order, approver_user_ids, mode)
VALUES
  ('c5000000-0000-0000-0000-000000000004', 'c4000000-0000-0000-0000-000000000004', 1,
   ARRAY['c1000000-0000-0000-0000-000000000003'::uuid], 'any_one'),
  ('c5000000-0000-0000-0000-000000000005', 'c4000000-0000-0000-0000-000000000004', 2,
   ARRAY['c1000000-0000-0000-0000-000000000004'::uuid], 'any_one');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Schema: function exists
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT has_function(
  'record_approval_decision',
  ARRAY['uuid', 'approval_decision_type', 'text'],
  'record_approval_decision(uuid, approval_decision_type, text) exists'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Non-approver cannot submit
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('outsider@nodwin.test');
SELECT throws_ok(
  $$SELECT public.record_approval_decision('c5000000-0000-0000-0000-000000000001', 'approved')$$,
  'insufficient_privilege', NULL,
  'non-approver cannot submit decision'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Rep (triggerer) cannot submit unless they are an approver
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('rep@nodwin.test');
SELECT throws_ok(
  $$SELECT public.record_approval_decision('c5000000-0000-0000-0000-000000000001', 'approved')$$,
  'insufficient_privilege', NULL,
  'rep (triggerer but not approver) cannot submit decision'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. any_one mode: first approver in array can submit and resolves step
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('approver1@nodwin.test');
SELECT lives_ok(
  $$SELECT public.record_approval_decision('c5000000-0000-0000-0000-000000000001', 'approved', 'Looks good')$$,
  'approver1 in user_ids[] can approve (any_one mode)'
);

SELECT is(
  (SELECT status::text FROM public.approval_steps WHERE id = 'c5000000-0000-0000-0000-000000000001'),
  'approved',
  'any_one step resolved to approved'
);

SELECT is(
  (SELECT decision::text FROM public.approval_decisions
   WHERE step_id = 'c5000000-0000-0000-0000-000000000001'
     AND decided_by_user_id = 'c1000000-0000-0000-0000-000000000003'),
  'approved',
  'decision row recorded with correct type'
);

SELECT is(
  (SELECT comment FROM public.approval_decisions
   WHERE step_id = 'c5000000-0000-0000-0000-000000000001'
     AND decided_by_user_id = 'c1000000-0000-0000-0000-000000000003'),
  'Looks good',
  'decision comment stored correctly'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Duplicate prevention: same user cannot submit twice on same step
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_service_role();
INSERT INTO public.approval_steps (id, instance_id, step_order, approver_user_ids, mode)
VALUES ('c5000000-0000-0000-0000-000000000006', 'c4000000-0000-0000-0000-000000000001', 9,
        ARRAY['c1000000-0000-0000-0000-000000000003'::uuid], 'any_one');

SELECT tests.as_user('approver1@nodwin.test');
SELECT lives_ok(
  $$SELECT public.record_approval_decision('c5000000-0000-0000-0000-000000000006', 'approved')$$,
  'approver1 submits first decision on fresh step'
);
SELECT throws_ok(
  $$SELECT public.record_approval_decision('c5000000-0000-0000-0000-000000000006', 'approved')$$,
  '23505', NULL,
  'same approver cannot submit duplicate decision'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Already resolved step: cannot submit
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('approver1@nodwin.test');
SELECT throws_ok(
  $$SELECT public.record_approval_decision('c5000000-0000-0000-0000-000000000003', 'approved')$$,
  '23505', NULL,
  'cannot submit on already resolved step'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. all_required mode: step stays pending until all approvers decide
-- ═══════════════════════════════════════════════════════════════════════════════

-- approver1 submits first on all_required step — step should still be pending
SELECT tests.as_user('approver1@nodwin.test');
SELECT lives_ok(
  $$SELECT public.record_approval_decision('c5000000-0000-0000-0000-000000000002', 'approved')$$,
  'approver1 submits first decision on all_required step'
);

SELECT is(
  (SELECT status::text FROM public.approval_steps WHERE id = 'c5000000-0000-0000-0000-000000000002'),
  'pending',
  'all_required step stays pending after first decision'
);

-- Now approver2 submits — step should resolve to approved
SELECT tests.as_user('approver2@nodwin.test');
SELECT lives_ok(
  $$SELECT public.record_approval_decision('c5000000-0000-0000-0000-000000000002', 'approved')$$,
  'approver2 submits on all_required step'
);

SELECT is(
  (SELECT status::text FROM public.approval_steps WHERE id = 'c5000000-0000-0000-0000-000000000002'),
  'approved',
  'all_required step resolved to approved when all approve'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. all_required mode: rejection resolves step immediately
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_service_role();
INSERT INTO public.approval_instances (id, workflow_id, entity_type, entity_id, status, triggered_by_user_id)
VALUES ('c4000000-0000-0000-0000-000000000005', 'c2000000-0000-0000-0000-000000000001', 'opportunity',
        '00000000-0000-0000-0000-000000000005', 'pending', 'c1000000-0000-0000-0000-000000000002');
INSERT INTO public.approval_steps (id, instance_id, step_order, approver_user_ids, mode)
VALUES ('c5000000-0000-0000-0000-000000000007', 'c4000000-0000-0000-0000-000000000005', 1,
        ARRAY['c1000000-0000-0000-0000-000000000003'::uuid, 'c1000000-0000-0000-0000-000000000004'::uuid], 'all_required');

SELECT tests.as_user('approver2@nodwin.test');
SELECT lives_ok(
  $$SELECT public.record_approval_decision('c5000000-0000-0000-0000-000000000007', 'rejected', 'Too risky')$$,
  'approver2 rejects in all_required mode'
);

SELECT is(
  (SELECT status::text FROM public.approval_steps WHERE id = 'c5000000-0000-0000-0000-000000000007'),
  'rejected',
  'step rejected immediately even with 1 of 2 approvers'
);

SELECT is(
  (SELECT status::text FROM public.approval_instances WHERE id = 'c4000000-0000-0000-0000-000000000005'),
  'rejected',
  'instance rejected when step rejected'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. Instance resolution: all sequential steps resolved -> instance resolved
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('approver1@nodwin.test');
SELECT lives_ok(
  $$SELECT public.record_approval_decision('c5000000-0000-0000-0000-000000000004', 'approved')$$,
  'first step of instance 4 approved'
);

SELECT tests.as_user('approver2@nodwin.test');
SELECT lives_ok(
  $$SELECT public.record_approval_decision('c5000000-0000-0000-0000-000000000005', 'approved')$$,
  'second step of instance 4 approved'
);

SELECT is(
  (SELECT status::text FROM public.approval_instances WHERE id = 'c4000000-0000-0000-0000-000000000004'),
  'approved',
  'instance resolved to approved when all steps done'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. Admin override
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_service_role();
INSERT INTO public.approval_steps (id, instance_id, step_order, approver_user_ids, mode)
VALUES ('c5000000-0000-0000-0000-000000000008', 'c4000000-0000-0000-0000-000000000001', 99,
        ARRAY['c1000000-0000-0000-0000-000000000003'::uuid], 'any_one');

SELECT tests.as_user('admin@nodwin.test');
SELECT lives_ok(
  $$SELECT public.record_approval_decision('c5000000-0000-0000-0000-000000000008', 'approved', 'Admin override')$$,
  'admin can submit decision on any step'
);

SELECT is(
  (SELECT status::text FROM public.approval_steps WHERE id = 'c5000000-0000-0000-0000-000000000008'),
  'approved',
  'admin decision resolves step'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 11. RLS: tightened INSERT policy — step must be pending
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('approver1@nodwin.test');
SELECT tests.assert_cannot_insert(
  'approval_decisions',
  format($$(gen_random_uuid(), 'c5000000-0000-0000-0000-000000000003'::uuid,
    'c1000000-0000-0000-0000-000000000003'::uuid, 'approved')$$),
  'cannot insert decision on resolved step via direct INSERT'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 12. RLS: tightened INSERT policy — duplicate prevention + approver check
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_service_role();
INSERT INTO public.approval_steps (id, instance_id, step_order, approver_user_ids, mode)
VALUES ('c5000000-0000-0000-0000-000000000009', 'c4000000-0000-0000-0000-000000000005', 99,
        ARRAY['c1000000-0000-0000-0000-000000000003'::uuid], 'any_one');
INSERT INTO public.approval_decisions (id, step_id, decided_by_user_id, decision)
VALUES ('c6000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000009',
        'c1000000-0000-0000-0000-000000000003', 'approved');

SELECT tests.as_user('approver1@nodwin.test');
SELECT tests.assert_cannot_insert(
  'approval_decisions',
  format($$(gen_random_uuid(), 'c5000000-0000-0000-0000-000000000009'::uuid,
    'c1000000-0000-0000-0000-000000000003'::uuid, 'approved')$$),
  'cannot insert duplicate decision via direct INSERT'
);

-- outsider cannot insert at all (not an approver)
SELECT tests.as_user('outsider@nodwin.test');
SELECT tests.assert_cannot_insert(
  'approval_decisions',
  format($$(gen_random_uuid(), 'c5000000-0000-0000-0000-000000000009'::uuid,
    'c1000000-0000-0000-0000-000000000005'::uuid, 'approved')$$),
  'non-approver cannot insert via direct INSERT'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Done
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT * FROM finish();

ROLLBACK;
