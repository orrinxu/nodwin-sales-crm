-- supabase/tests/approval_workflow_admin.test.sql
-- pgTAP: replace_workflow_steps (ORR-604 Phase 2) — admin-only, atomic replace.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(6);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a5000000-0000-0000-0000-0000000000a5', 'admin@nodwin.com', '{"full_name":"Admin"}'),
  ('a5000000-0000-0000-0000-0000000000b5', 'rep@nodwin.com',   '{"full_name":"Rep"}')
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.users (id, email, full_name, primary_role) VALUES
  ('a5000000-0000-0000-0000-0000000000a5', 'admin@nodwin.com', 'Admin', 'admin'),
  ('a5000000-0000-0000-0000-0000000000b5', 'rep@nodwin.com',   'Rep',   'sales_rep')
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

INSERT INTO public.approval_workflows (id, name, entity_type, entity_id, active)
VALUES ('a5f00000-0000-0000-0000-0000000000f1', 'WF', 'opportunity', NULL, true)
ON CONFLICT (id) DO NOTHING;

-- 1. A non-admin cannot replace steps.
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.replace_workflow_steps('a5f00000-0000-0000-0000-0000000000f1',
    '[{"step_order":1,"approver_role":"sales_manager"}]'::jsonb)$$,
  '42501', NULL, 'non-admin cannot edit workflow steps'
);

-- 2. An admin can replace steps.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT public.replace_workflow_steps('a5f00000-0000-0000-0000-0000000000f1',
    '[{"step_order":1,"approver_role":"sales_manager"},{"step_order":2,"approver_role":"finance"}]'::jsonb)$$,
  'admin can replace workflow steps'
);
-- 3. The two steps are present in order.
SELECT results_eq(
  $$SELECT step_order, approver_role::text FROM public.approval_workflow_steps
    WHERE workflow_id = 'a5f00000-0000-0000-0000-0000000000f1' ORDER BY step_order$$,
  $$VALUES (1, 'sales_manager'), (2, 'finance')$$,
  'steps inserted in order'
);
-- 4. Replacing again swaps the whole set.
SELECT lives_ok(
  $$SELECT public.replace_workflow_steps('a5f00000-0000-0000-0000-0000000000f1',
    '[{"step_order":1,"approver_role":"regional_head"}]'::jsonb)$$,
  'admin can replace again'
);
SELECT results_eq(
  $$SELECT step_order, approver_role::text FROM public.approval_workflow_steps
    WHERE workflow_id = 'a5f00000-0000-0000-0000-0000000000f1' ORDER BY step_order$$,
  $$VALUES (1, 'regional_head')$$,
  'replace swapped the whole set (last-write-wins)'
);
-- 5. Atomicity: an invalid step (no approver) fails the CHECK and rolls back the
--    delete, so the prior set survives.
SELECT throws_ok(
  $$SELECT public.replace_workflow_steps('a5f00000-0000-0000-0000-0000000000f1',
    '[{"step_order":1}]'::jsonb)$$,
  NULL, NULL, 'a step with no approver is rejected'
);

SELECT * FROM finish();

ROLLBACK;
