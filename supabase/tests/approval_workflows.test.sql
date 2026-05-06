-- supabase/tests/approval_workflows.test.sql
-- pgTAP tests for the approval workflow subsystem tables and RLS policies.
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(49);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('77777777-7777-7777-7777-777777777777', 'admin@nodwin.com', '{"full_name":"Admin User"}'),
  ('88888888-8888-8888-8888-888888888888', 'rep@nodwin.com',   '{"full_name":"Sales Rep"}'),
  ('99999999-9999-9999-9999-999999999999', 'mgr@nodwin.com',   '{"full_name":"Manager"}'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', 'other@nodwin.com',  '{"full_name":"Other Rep"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('77777777-7777-7777-7777-777777777777', 'admin@nodwin.com', 'Admin User', 'admin',       '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  ('88888888-8888-8888-8888-888888888888', 'rep@nodwin.com',   'Sales Rep',  'sales_rep',   '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  ('99999999-9999-9999-9999-999999999999', 'mgr@nodwin.com',   'Manager',    'sales_manager','0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', 'other@nodwin.com', 'Other Rep',  'sales_rep',   '1b1b1b1b-1b1b-1b1b-1b1b-1b1b1b1b1b1b')
ON CONFLICT (id) DO UPDATE SET
  full_name         = EXCLUDED.full_name,
  primary_role      = EXCLUDED.primary_role,
  primary_entity_id = EXCLUDED.primary_entity_id;

-- Insert seed data as service role.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.approval_workflows (id, name, entity_type, created_by, updated_by)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Deal Approval', 'opportunity', '77777777-7777-7777-7777-777777777777', '77777777-7777-7777-7777-777777777777'),
  ('22222222-2222-2222-2222-222222222222', 'Account Review', 'account', '77777777-7777-7777-7777-777777777777', '77777777-7777-7777-7777-777777777777');

INSERT INTO public.approval_instances (id, workflow_id, entity_type, entity_id, status, triggered_by_user_id, created_by, updated_by)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'opportunity', '33333333-3333-3333-3333-333333333333', 'pending', '88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', '77777777-7777-7777-7777-777777777777'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'account',     '44444444-4444-4444-4444-444444444444', 'pending', '88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', '77777777-7777-7777-7777-777777777777'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'opportunity', '55555555-5555-5555-5555-555555555555', 'pending', NULL, '77777777-7777-7777-7777-777777777777', '77777777-7777-7777-7777-777777777777');

-- Steps for instance aaaaaaaa: step 1 → mgr, step 2 → another user
INSERT INTO public.approval_steps (id, instance_id, step_order, approver_user_id, status)
VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, '99999999-9999-9999-9999-999999999999', 'pending'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', 'pending');

-- Step for instance bbbbbbbb: step 1 → mgr
INSERT INTO public.approval_steps (id, instance_id, step_order, approver_user_id, status)
VALUES
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, '99999999-9999-9999-9999-999999999999', 'pending');

-- Step for instance cccccccc: step 1 → no specific user, role-based (sales_manager)
INSERT INTO public.approval_steps (id, instance_id, step_order, approver_role, status)
VALUES
  ('11111111-1111-1111-1111-111111111112', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 1, 'sales_manager', 'pending');

-- A decision already recorded
INSERT INTO public.approval_decisions (id, step_id, decided_by_user_id, decision, comment)
VALUES
  ('22222222-2222-2222-2222-222222222221', 'ffffffff-ffff-ffff-ffff-ffffffffffff', '99999999-9999-9999-9999-999999999999', 'approved', 'Looks good');

-- ═══════════════════════════════════════════════════════════════════════════════
-- approval_workflows — admin only
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Non-admin cannot read approval_workflows
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.approval_workflows WHERE true$$,
  'non-admin cannot read approval_workflows'
);

-- 2. Admin can read approval_workflows
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.approval_workflows WHERE true$$,
  'admin can read approval_workflows'
);

-- 3. Non-admin cannot insert approval_workflows
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.approval_workflows (id, name, entity_type) VALUES ('33333333-3333-3333-3333-333333333333', 'Bad Workflow', 'opportunity')$$,
  '42501',
  NULL,
  'non-admin cannot insert approval_workflows'
);

-- 4. Admin can insert approval_workflows
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.approval_workflows (id, name, entity_type) VALUES ('33333333-3333-3333-3333-333333333333', 'Test Workflow', 'contact')$$,
  'admin can insert approval_workflows'
);

-- 5. Non-admin cannot update approval_workflows
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.approval_workflows SET name = 'Hacked' WHERE id = '11111111-1111-1111-1111-111111111111';
SELECT is(
  (SELECT name FROM public.approval_workflows WHERE id = '11111111-1111-1111-1111-111111111111'),
  'Deal Approval',
  'non-admin cannot update approval_workflows (silently blocked)'
);

-- 6. Admin can update approval_workflows
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.approval_workflows SET name = 'Deal Approval (Updated)' WHERE id = '11111111-1111-1111-1111-111111111111';
SELECT is(
  (SELECT name FROM public.approval_workflows WHERE id = '11111111-1111-1111-1111-111111111111'),
  'Deal Approval (Updated)',
  'admin can update approval_workflows'
);

-- 7. Non-admin cannot delete approval_workflows
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.approval_workflows WHERE id = '33333333-3333-3333-3333-333333333333';
SELECT isnt_empty(
  $$SELECT id FROM public.approval_workflows WHERE id = '33333333-3333-3333-3333-333333333333'$$,
  'non-admin cannot delete approval_workflows (silently blocked)'
);

-- 8. Admin can delete approval_workflows
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.approval_workflows WHERE id = '33333333-3333-3333-3333-333333333333'$$,
  'admin can delete approval_workflows'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- approval_instances — scoped read
-- ═══════════════════════════════════════════════════════════════════════════════

-- 9. Triggered user can read their instance
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.approval_instances WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'triggered_by user can read their instance'
);

-- 10. Triggered user can read their other instance
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.approval_instances WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'triggered_by user can read their second instance'
);

-- 11. Assigned approver can read instance (via step linkage)
SELECT tests.as_user('mgr@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.approval_instances WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'assigned approver can read instance via steps'
);

-- 12. Non-involved user cannot read instance
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.approval_instances WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'non-involved user cannot read instance'
);

-- 13. Admin can read any instance
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.approval_instances WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  'admin can read any instance'
);

-- 14. Non-admin cannot insert approval_instances
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.approval_instances (id, workflow_id, entity_type, entity_id, triggered_by_user_id) VALUES ('dddddddd-dddd-dddd-dddd-ddddddddddda', '11111111-1111-1111-1111-111111111111', 'opportunity', '66666666-6666-6666-6666-666666666666', '88888888-8888-8888-8888-888888888888')$$,
  '42501',
  NULL,
  'non-admin cannot insert approval_instances'
);

-- 15. Admin can insert approval_instances
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.approval_instances (id, workflow_id, entity_type, entity_id, triggered_by_user_id) VALUES ('dddddddd-dddd-dddd-dddd-ddddddddddda', '11111111-1111-1111-1111-111111111111', 'opportunity', '66666666-6666-6666-6666-666666666666', '88888888-8888-8888-8888-888888888888')$$,
  'admin can insert approval_instances'
);

-- 16. Non-admin cannot update approval_instances
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.approval_instances SET status = 'cancelled' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT status::text FROM public.approval_instances WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'pending',
  'non-admin cannot update approval_instances (silently blocked)'
);

-- 17. Admin can update approval_instances
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.approval_instances SET status = 'cancelled' WHERE id = 'dddddddd-dddd-dddd-dddd-ddddddddddda';
SELECT is(
  (SELECT status::text FROM public.approval_instances WHERE id = 'dddddddd-dddd-dddd-dddd-ddddddddddda'),
  'cancelled',
  'admin can update approval_instances'
);

-- 18. Non-admin cannot delete approval_instances
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.approval_instances WHERE id = 'dddddddd-dddd-dddd-dddd-ddddddddddda';
SELECT isnt_empty(
  $$SELECT id FROM public.approval_instances WHERE id = 'dddddddd-dddd-dddd-dddd-ddddddddddda'$$,
  'non-admin cannot delete approval_instances (silently blocked)'
);

-- 19. Admin can delete approval_instances
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.approval_instances WHERE id = 'dddddddd-dddd-dddd-dddd-ddddddddddda'$$,
  'admin can delete approval_instances'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- approval_steps — scoped read
-- ═══════════════════════════════════════════════════════════════════════════════

-- 20. Assigned approver can read their step
SELECT tests.as_user('mgr@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.approval_steps WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'$$,
  'assigned approver can read their step'
);

-- 21. Triggered user can read steps of their instance
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.approval_steps WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'$$,
  'triggered user can read steps of their instance'
);

-- 22. Non-involved user cannot read steps
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.approval_steps WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'$$,
  'non-involved user cannot read step (neither approver nor triggered_by)'
);

-- 23. Admin can read any step
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.approval_steps WHERE id = '11111111-1111-1111-1111-111111111112'$$,
  'admin can read any step'
);

-- 24. Non-admin cannot insert approval_steps
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.approval_steps (id, instance_id, step_order, approver_user_id) VALUES ('55555555-5555-5555-5555-555555555551', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3, '99999999-9999-9999-9999-999999999999')$$,
  '42501',
  NULL,
  'non-admin cannot insert approval_steps'
);

-- 25. Admin can insert approval_steps
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.approval_steps (id, instance_id, step_order, approver_user_id) VALUES ('55555555-5555-5555-5555-555555555551', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 3, '99999999-9999-9999-9999-999999999999')$$,
  'admin can insert approval_steps'
);

-- 26. Non-admin cannot update approval_steps
SELECT tests.as_user('mgr@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.approval_steps SET status = 'approved' WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
SELECT is(
  (SELECT status::text FROM public.approval_steps WHERE id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  'pending',
  'non-admin cannot update approval_steps (silently blocked)'
);

-- 27. Admin can update approval_steps
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.approval_steps SET status = 'skipped' WHERE id = '55555555-5555-5555-5555-555555555551';
SELECT is(
  (SELECT status::text FROM public.approval_steps WHERE id = '55555555-5555-5555-5555-555555555551'),
  'skipped',
  'admin can update approval_steps'
);

-- 28. Non-admin cannot delete approval_steps
SELECT tests.as_user('mgr@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.approval_steps WHERE id = '55555555-5555-5555-5555-555555555551';
SELECT isnt_empty(
  $$SELECT id FROM public.approval_steps WHERE id = '55555555-5555-5555-5555-555555555551'$$,
  'non-admin cannot delete approval_steps (silently blocked)'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- approval_decisions — approver can insert
-- ═══════════════════════════════════════════════════════════════════════════════

-- 29. Assigned approver can read decisions on their step
SELECT tests.as_user('mgr@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.approval_decisions WHERE step_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'$$,
  'assigned approver can read decisions on their step'
);

-- 30. Triggered user can read decisions on their instance's steps
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.approval_decisions WHERE step_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'$$,
  'triggered user can read decisions on their instance steps'
);

-- 31. Non-involved user cannot read decisions
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.approval_decisions WHERE step_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'$$,
  'non-involved user cannot read decisions'
);

-- 32. Assigned approver can insert a decision
SELECT tests.as_user('mgr@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.approval_decisions (id, step_id, decided_by_user_id, decision, comment) VALUES ('33333333-3333-3333-3333-333333333331', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '99999999-9999-9999-9999-999999999999', 'approved', 'Looks good to me')$$,
  'assigned approver can insert a decision'
);

-- 33. Non-approver cannot insert a decision on a step they are not assigned to
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.approval_decisions (id, step_id, decided_by_user_id, decision, comment) VALUES ('44444444-4444-4444-4444-444444444441', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaab', 'rejected', 'Not qualified')$$,
  '42501',
  NULL,
  'non-approver cannot insert decision on step they are not assigned to'
);

-- 34. Admin can insert any decision
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.approval_decisions (id, step_id, decided_by_user_id, decision, comment) VALUES ('44444444-4444-4444-4444-444444444441', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '77777777-7777-7777-7777-777777777777', 'approved', 'Admin override')$$,
  'admin can insert any decision'
);

-- 35. Non-admin cannot update decisions
SELECT tests.as_user('mgr@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.approval_decisions SET comment = 'Hacked comment' WHERE id = '33333333-3333-3333-3333-333333333331';
SELECT is(
  (SELECT comment FROM public.approval_decisions WHERE id = '33333333-3333-3333-3333-333333333331'),
  'Looks good to me',
  'non-admin cannot update decisions (silently blocked)'
);

-- 36. Admin can update decisions
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.approval_decisions SET comment = 'Updated comment' WHERE id = '33333333-3333-3333-3333-333333333331';
SELECT is(
  (SELECT comment FROM public.approval_decisions WHERE id = '33333333-3333-3333-3333-333333333331'),
  'Updated comment',
  'admin can update decisions'
);

-- 37. Non-admin cannot delete decisions
SELECT tests.as_user('mgr@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.approval_decisions WHERE id = '44444444-4444-4444-4444-444444444441';
SELECT isnt_empty(
  $$SELECT id FROM public.approval_decisions WHERE id = '44444444-4444-4444-4444-444444444441'$$,
  'non-admin cannot delete decisions (silently blocked)'
);

-- 38. Admin can delete decisions
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.approval_decisions WHERE id = '44444444-4444-4444-4444-444444444441'$$,
  'admin can delete decisions'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Anon access — all denied
-- ═══════════════════════════════════════════════════════════════════════════════

-- 39. Anon cannot read approval_workflows
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.approval_workflows WHERE true$$,
  'anon cannot read approval_workflows'
);

-- 40. Anon cannot read approval_instances
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.approval_instances WHERE true$$,
  'anon cannot read approval_instances'
);

-- 41. Anon cannot read approval_steps
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.approval_steps WHERE true$$,
  'anon cannot read approval_steps'
);

-- 42. Anon cannot read approval_decisions
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.approval_decisions WHERE true$$,
  'anon cannot read approval_decisions'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Audit log captures changes
-- ═══════════════════════════════════════════════════════════════════════════════

-- 43. Audit log captured approval_workflows changes
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_log WHERE table_name = 'approval_workflows' AND row_id = '11111111-1111-1111-1111-111111111111'),
  '>=',
  1,
  'audit_log captured at least one approval_workflows change'
);

-- 44. Audit log captured approval_instances changes
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_log WHERE table_name = 'approval_instances' AND row_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '>=',
  1,
  'audit_log captured at least one approval_instances change'
);

-- 45. Audit log captured approval_steps changes
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_log WHERE table_name = 'approval_steps' AND row_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'),
  '>=',
  1,
  'audit_log captured at least one approval_steps change'
);

-- 46. Audit log captured approval_decisions changes
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_log WHERE table_name = 'approval_decisions' AND row_id = '22222222-2222-2222-2222-222222222221'),
  '>=',
  1,
  'audit_log captured at least one approval_decisions change'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Triggers
-- ═══════════════════════════════════════════════════════════════════════════════

-- 47. created_by and updated_by set automatically on INSERT
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
INSERT INTO public.approval_workflows (id, name, entity_type) VALUES ('55555555-5555-5555-5555-555555555555', 'Auto Fields', 'opportunity');
SELECT is(
  (SELECT created_by FROM public.approval_workflows WHERE id = '55555555-5555-5555-5555-555555555555'),
  '77777777-7777-7777-7777-777777777777'::uuid,
  'created_by set to auth.uid() on INSERT'
);
SELECT is(
  (SELECT updated_by FROM public.approval_workflows WHERE id = '55555555-5555-5555-5555-555555555555'),
  '77777777-7777-7777-7777-777777777777'::uuid,
  'updated_by set to auth.uid() on INSERT'
);

-- 48. Duplicate step_order in same instance is rejected
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.approval_steps (id, instance_id, step_order, approver_user_id) VALUES ('66666666-6666-6666-6666-666666666666', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 2, '88888888-8888-8888-8888-888888888888')$$,
  '23505',
  NULL,
  'duplicate step_order in same instance is rejected'
);

-- 49. Step with neither role nor user is rejected
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.approval_steps (id, instance_id, step_order) VALUES ('77777777-7777-7777-7777-777777777770', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 4)$$,
  '23514',
  NULL,
  'step without approver_role or approver_user_id is rejected'
);

SELECT * FROM finish();

ROLLBACK;
