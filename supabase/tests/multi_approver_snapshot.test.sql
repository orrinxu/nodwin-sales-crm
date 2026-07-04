-- supabase/tests/multi_approver_snapshot.test.sql
-- pgTAP: multi-approver materialization + snapshot (ORR-638).
--
-- Run with: supabase test db

BEGIN;

SELECT plan(31);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('9a000000-0000-0000-0000-0000000000a1', 'admin-9@nodwin.com',  '{"full_name":"Admin"}'),
  ('9b000000-0000-0000-0000-0000000000b1', 'rep-9@nodwin.com',    '{"full_name":"Rep"}'),
  ('9c000000-0000-0000-0000-0000000000c1', 'approver_a-9@nodwin.com', '{"full_name":"App A"}'),
  ('9d000000-0000-0000-0000-0000000000d1', 'approver_b-9@nodwin.com', '{"full_name":"App B"}'),
  ('9e000000-0000-0000-0000-0000000000e1', 'approver_c-9@nodwin.com', '{"full_name":"App C"}'),
  ('9f000000-0000-0000-0000-0000000000f1', 'outsider-9@nodwin.com',   '{"full_name":"Outsider"}')
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name) VALUES
  ('9e000000-0000-0000-0000-0000000000e1', 'Entity Nine')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('9a000000-0000-0000-0000-0000000000a1', 'admin-9@nodwin.com',  'Admin',    'admin',         '9e000000-0000-0000-0000-0000000000e1'),
  ('9b000000-0000-0000-0000-0000000000b1', 'rep-9@nodwin.com',    'Rep',      'sales_rep',     '9e000000-0000-0000-0000-0000000000e1'),
  ('9c000000-0000-0000-0000-0000000000c1', 'approver_a-9@nodwin.com', 'App A', 'sales_manager',  '9e000000-0000-0000-0000-0000000000e1'),
  ('9d000000-0000-0000-0000-0000000000d1', 'approver_b-9@nodwin.com', 'App B', 'finance',       '9e000000-0000-0000-0000-0000000000e1'),
  ('9e000000-0000-0000-0000-0000000000e1', 'approver_c-9@nodwin.com', 'App C', 'group_sales_lead', '9e000000-0000-0000-0000-0000000000e1'),
  ('9f000000-0000-0000-0000-0000000000f1', 'outsider-9@nodwin.com', 'Outsider', 'sales_rep',    '9e000000-0000-0000-0000-0000000000e1')
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role, primary_entity_id = EXCLUDED.primary_entity_id;

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id) VALUES
  ('9b000000-0000-0000-0000-0000000000b1', 'BU Nine', '9e000000-0000-0000-0000-0000000000e1', 'sales', '9c000000-0000-0000-0000-0000000000c1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.accounts (id, name, account_owner_user_id, created_by)
VALUES ('9a000000-0000-0000-0000-0000000000a1', 'Acct9', '9b000000-0000-0000-0000-0000000000b1', '9b000000-0000-0000-0000-0000000000b1')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES
  ('90000000-0000-0000-0000-000000000001', 'Opp Nine', '9a000000-0000-0000-0000-0000000000a1', 'qualify',
   '9b000000-0000-0000-0000-0000000000b1', '9b000000-0000-0000-0000-0000000000b1', 50000, 'USD', 'standard')
ON CONFLICT (id) DO NOTHING;

-- Entity-scoped workflow with multi-approver steps.
-- Step 1: all_required — A, B, and C must all approve.
-- Step 2: any_one   — A or B can approve (any one suffices).
DO $$
DECLARE _wf uuid;
BEGIN
  INSERT INTO public.approval_workflows (name, entity_type, entity_id, active, trigger_stage)
  VALUES ('E9 Multi Approver WF', 'opportunity', '9e000000-0000-0000-0000-0000000000e1', true, 'meet_and_present')
  RETURNING id INTO _wf;
  INSERT INTO public.approval_workflow_steps (workflow_id, step_order, approver_kind, approver_user_ids, mode, name) VALUES
    (_wf, 1, 'user', ARRAY[
      '9c000000-0000-0000-0000-0000000000c1',
      '9d000000-0000-0000-0000-0000000000d1',
      '9e000000-0000-0000-0000-0000000000e1'
    ]::uuid[], 'all_required', 'All Hands Review'),
    (_wf, 2, 'user', ARRAY[
      '9c000000-0000-0000-0000-0000000000c1',
      '9d000000-0000-0000-0000-0000000000d1'
    ]::uuid[], 'any_one', 'Final Sign-off');
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1–5. SUBMIT: snapshot + field materialization
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Owner submits.
SELECT tests.as_user('rep-9@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.submit_opportunity_for_approval('90000000-0000-0000-0000-000000000001')$$,
  'owner submits opp nine'
);

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

-- 2. opportunity_id populated on the instance.
SELECT is(
  (SELECT opportunity_id FROM public.approval_instances
   WHERE entity_id = '90000000-0000-0000-0000-000000000001'),
  '90000000-0000-0000-0000-000000000001'::uuid,
  'opportunity_id populated on the instance'
);

-- 3. trigger_stage populated on the instance.
SELECT is(
  (SELECT trigger_stage::text FROM public.approval_instances
   WHERE entity_id = '90000000-0000-0000-0000-000000000001'),
  'meet_and_present',
  'trigger_stage populated on the instance'
);

-- 4. workflow_snapshot populated and has expected shape.
SELECT ok(
  (SELECT workflow_snapshot IS NOT NULL AND workflow_snapshot ? 'steps'
   FROM public.approval_instances
   WHERE entity_id = '90000000-0000-0000-0000-000000000001'),
  'workflow_snapshot populated with steps'
);

-- 5. Runtime steps materialized approver_user_ids, mode, and name from the template.
SELECT results_eq(
  $$SELECT s.name, s.mode::text, s.approver_user_ids
    FROM public.approval_steps s
    JOIN public.approval_instances i ON i.id = s.instance_id
    WHERE i.entity_id = '90000000-0000-0000-0000-000000000001'
    ORDER BY s.step_order$$,
  $$VALUES
    ('All Hands Review', 'all_required',
     ARRAY['9c000000-0000-0000-0000-0000000000c1','9d000000-0000-0000-0000-0000000000d1','9e000000-0000-0000-0000-0000000000e1']::uuid[]),
    ('Final Sign-off', 'any_one',
     ARRAY['9c000000-0000-0000-0000-0000000000c1','9d000000-0000-0000-0000-0000000000d1']::uuid[])$$,
  'steps materialized name, mode, and approver_user_ids'
);

-- Capture step IDs.
SELECT s.id AS s1 FROM public.approval_steps s
  JOIN public.approval_instances i ON i.id = s.instance_id
  WHERE i.entity_id = '90000000-0000-0000-0000-000000000001' AND s.step_order = 1 \gset
SELECT s.id AS s2 FROM public.approval_steps s
  JOIN public.approval_instances i ON i.id = s.instance_id
  WHERE i.entity_id = '90000000-0000-0000-0000-000000000001' AND s.step_order = 2 \gset

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6–10. ALL_REQUIRED mode (Step 1: A, B, C must all approve)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 6. Outsider cannot decide (not in approver_user_ids).
SELECT tests.as_user('outsider-9@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'s1'),
  '42501', NULL, 'a non-approver cannot decide an all_required step'
);

-- 7. Approver A approves → step stays pending (not all have decided).
SELECT tests.as_user('approver_a-9@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'s1'),
  'approver A approves (all_required, step stays pending)'
);
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status::text FROM public.approval_steps WHERE id = :'s1'),
  'pending', 'step still pending after only A approved (all_required)'
);

-- 8. Approver A cannot decide again (duplicate prevention).
SELECT tests.as_user('approver_a-9@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'s1'),
  '23505', NULL, 'approver A cannot decide the same step twice (all_required)'
);

-- 9. Approver B approves → step still pending (C hasn't decided).
SELECT tests.as_user('approver_b-9@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'s1'),
  'approver B approves (all_required, step still pending)'
);
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status::text FROM public.approval_steps WHERE id = :'s1'),
  'pending', 'step still pending after only A and B approved (all_required)'
);

-- 10. Approver C approves → step completes.
SELECT tests.as_user('approver_c-9@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'s1'),
  'approver C approves (all_required, step completes)'
);
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status::text FROM public.approval_steps WHERE id = :'s1'),
  'approved', 'step approved after all three decided (all_required)'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 11–17. ALL_REQUIRED — rejection is immediate
-- ═══════════════════════════════════════════════════════════════════════════════

-- Create a second opportunity + workflow for the rejection test.
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES
  ('90000000-0000-0000-0000-000000000002', 'Opp Nine Reject', '9a000000-0000-0000-0000-0000000000a1', 'qualify',
   '9b000000-0000-0000-0000-0000000000b1', '9b000000-0000-0000-0000-0000000000b1', 60000, 'USD', 'standard')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE _wf uuid;
BEGIN
  INSERT INTO public.approval_workflows (name, entity_type, entity_id, active)
  VALUES ('E9 Reject WF', 'opportunity', '9e000000-0000-0000-0000-0000000000e1', true)
  RETURNING id INTO _wf;
  INSERT INTO public.approval_workflow_steps (workflow_id, step_order, approver_kind, approver_user_ids, mode, name) VALUES
    (_wf, 1, 'user', ARRAY['9c000000-0000-0000-0000-0000000000c1','9d000000-0000-0000-0000-0000000000d1']::uuid[], 'all_required', 'Dual Approval');
END $$;

-- 11. Submit.
SELECT tests.as_user('rep-9@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.submit_opportunity_for_approval('90000000-0000-0000-0000-000000000002')$$,
  'submit opp for reject test'
);

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT s.id AS r_s1 FROM public.approval_steps s
  JOIN public.approval_instances i ON i.id = s.instance_id
  WHERE i.entity_id = '90000000-0000-0000-0000-000000000002' AND s.step_order = 1 \gset

-- 12. Approver A approves → step pending.
SELECT tests.as_user('approver_a-9@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'r_s1'),
  'A approves (all_required, before reject)'
);

-- 13. Approver B rejects → step AND instance rejected immediately.
SELECT tests.as_user('approver_b-9@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.record_approval_decision(%L, 'rejected')$$, :'r_s1'),
  'B rejects (all_required, immediate rejection)'
);

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status::text FROM public.approval_steps WHERE id = :'r_s1'),
  'rejected', 'all_required step rejected immediately when one approver rejects'
);
SELECT is(
  (SELECT status::text FROM public.approval_instances WHERE entity_id = '90000000-0000-0000-0000-000000000002'),
  'rejected', 'instance rejected immediately on all_required step rejection'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 15–21. ANY_ONE mode (Step 2 of Opp Nine: A or B can approve)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 15. Step 2 is still pending (Step 1 is approved but sequential order satisfied).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status::text FROM public.approval_steps WHERE id = :'s2'),
  'pending', 'step 2 pending before any decision'
);

-- 16. Outsider cannot decide step 2 (not in approver_user_ids).
SELECT tests.as_user('outsider-9@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'s2'),
  '42501', NULL, 'non-approver cannot decide an any_one step'
);

-- 17. Approver A approves → step 2 completes immediately (any_one).
SELECT tests.as_user('approver_a-9@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'s2'),
  'approver A approves step 2 (any_one, immediate completion)'
);

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status::text FROM public.approval_steps WHERE id = :'s2'),
  'approved', 'any_one step approved after first approval'
);

-- 18. Instance fully approved (both steps done).
SELECT is(
  (SELECT status::text FROM public.approval_instances WHERE entity_id = '90000000-0000-0000-0000-000000000001'),
  'approved', 'instance approved after both steps completed'
);

-- 19. Approver B cannot also decide the already-completed any_one step.
SELECT tests.as_user('approver_b-9@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'s2'),
  '23505', NULL, 'cannot decide an already-completed any_one step'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 20–24. ANY_ONE — rejection is immediate
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier) VALUES
  ('90000000-0000-0000-0000-000000000003', 'Opp Nine A1Reject', '9a000000-0000-0000-0000-0000000000a1', 'qualify',
   '9b000000-0000-0000-0000-0000000000b1', '9b000000-0000-0000-0000-0000000000b1', 70000, 'USD', 'standard')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE _wf uuid;
BEGIN
  INSERT INTO public.approval_workflows (name, entity_type, entity_id, active)
  VALUES ('E9 AnyOne Reject WF', 'opportunity', '9e000000-0000-0000-0000-0000000000e1', true)
  RETURNING id INTO _wf;
  INSERT INTO public.approval_workflow_steps (workflow_id, step_order, approver_kind, approver_user_ids, mode, name) VALUES
    (_wf, 1, 'user', ARRAY['9c000000-0000-0000-0000-0000000000c1','9d000000-0000-0000-0000-0000000000d1']::uuid[], 'any_one', 'Quick Sign-off');
END $$;

-- 20. Submit.
SELECT tests.as_user('rep-9@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.submit_opportunity_for_approval('90000000-0000-0000-0000-000000000003')$$,
  'submit opp for any_one reject test'
);

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT s.id AS a1_s1 FROM public.approval_steps s
  JOIN public.approval_instances i ON i.id = s.instance_id
  WHERE i.entity_id = '90000000-0000-0000-0000-000000000003' AND s.step_order = 1 \gset

-- 21. Approver B rejects → step AND instance rejected immediately (any_one).
SELECT tests.as_user('approver_b-9@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  format($$SELECT public.record_approval_decision(%L, 'rejected')$$, :'a1_s1'),
  'B rejects any_one step (immediate rejection)'
);

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT is(
  (SELECT status::text FROM public.approval_steps WHERE id = :'a1_s1'),
  'rejected', 'any_one step rejected immediately on rejection'
);
SELECT is(
  (SELECT status::text FROM public.approval_instances WHERE entity_id = '90000000-0000-0000-0000-000000000003'),
  'rejected', 'instance rejected immediately on any_one rejection'
);

-- 22. Approver A cannot decide after rejection.
SELECT tests.as_user('approver_a-9@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  format($$SELECT public.record_approval_decision(%L, 'approved')$$, :'a1_s1'),
  '23505', NULL, 'cannot decide after any_one step already rejected'
);

-- 23. workflow_snapshot contains the correct step names.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT ok(
  (SELECT workflow_snapshot->'steps'->0->>'name' = 'All Hands Review'
   FROM public.approval_instances WHERE entity_id = '90000000-0000-0000-0000-000000000001'),
  'workflow_snapshot step names preserved'
);

-- 24. workflow_snapshot contains mode on each step.
SELECT ok(
  (SELECT workflow_snapshot->'steps'->0->>'mode' = 'all_required'
   AND workflow_snapshot->'steps'->1->>'mode' = 'any_one'
   FROM public.approval_instances WHERE entity_id = '90000000-0000-0000-0000-000000000001'),
  'workflow_snapshot modes preserved'
);

SELECT * FROM finish();

ROLLBACK;
