-- supabase/tests/approval_workflow_steps.test.sql
-- pgTAP tests for approval_workflow_steps table, RLS, and seed data.
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-608 Phase 0
-- Run with: supabase test db

BEGIN;

SELECT plan(42);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('77777777-7777-7777-7777-777777777777', 'admin@nodwin.com', '{"full_name":"Admin User"}'),
  ('88888888-8888-8888-8888-888888888888', 'rep@nodwin.com',   '{"full_name":"Sales Rep"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('77777777-7777-7777-7777-777777777777', 'admin@nodwin.com', 'Admin User', 'admin',     'e0000001-0001-0001-0001-000000000001'),
  ('88888888-8888-8888-8888-888888888888', 'rep@nodwin.com',   'Sales Rep',  'sales_rep', 'e0000001-0001-0001-0001-000000000001')
ON CONFLICT (id) DO UPDATE SET
  full_name         = EXCLUDED.full_name,
  primary_role      = EXCLUDED.primary_role,
  primary_entity_id = EXCLUDED.primary_entity_id;

-- Setup seed data as service role
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.approval_workflows (id, name, entity_type, created_by, updated_by)
VALUES ('11111111-1111-1111-1111-111111111111', 'Test Workflow', 'opportunity', '77777777-7777-7777-7777-777777777777', '77777777-7777-7777-7777-777777777777');

INSERT INTO public.approval_workflow_steps (id, workflow_id, step_order, name, approver_role, approver_kind, mode)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 1, 'Manager Step', 'sales_manager', 'role', 'all_required');

-- Create an instance + runtime steps for approver_user_ids[] testing
INSERT INTO public.approval_instances (id, workflow_id, entity_type, entity_id, status, triggered_by_user_id, created_by, updated_by)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'opportunity', 'd0000001-0001-0001-0001-000000000001', 'pending', '88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', '77777777-7777-7777-7777-777777777777');

INSERT INTO public.approval_steps (id, instance_id, step_order, approver_user_ids, mode)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, ARRAY['88888888-8888-8888-8888-888888888888']::uuid[], 'any_one');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Schema — approval_step_mode enum exists
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT has_enum('public', 'approval_step_mode',
  'enum approval_step_mode exists');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Schema — new columns on approval_workflows
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT has_column('public', 'approval_workflows', 'applies_to_entity_id',
  'approval_workflows has applies_to_entity_id');
SELECT has_column('public', 'approval_workflows', 'trigger_stage',
  'approval_workflows has trigger_stage');
SELECT has_column('public', 'approval_workflows', 'enforce_gate',
  'approval_workflows has enforce_gate');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Schema — new columns on approval_workflow_steps (template)
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT has_column('public', 'approval_workflow_steps', 'name',
  'approval_workflow_steps has name');
SELECT has_column('public', 'approval_workflow_steps', 'approver_user_ids',
  'approval_workflow_steps has approver_user_ids[]');
SELECT has_column('public', 'approval_workflow_steps', 'mode',
  'approval_workflow_steps has mode');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Schema — new columns on approval_steps (runtime)
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT has_column('public', 'approval_steps', 'approver_user_ids',
  'approval_steps has approver_user_ids[]');
SELECT has_column('public', 'approval_steps', 'mode',
  'approval_steps has mode');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Schema — new columns on approval_instances (runtime)
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT has_column('public', 'approval_instances', 'opportunity_id',
  'approval_instances has opportunity_id');
SELECT has_column('public', 'approval_instances', 'workflow_snapshot',
  'approval_instances has workflow_snapshot');
SELECT has_column('public', 'approval_instances', 'trigger_stage',
  'approval_instances has trigger_stage');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. RLS — approval_workflow_steps has RLS enabled
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT has_rls('public', 'approval_workflow_steps',
  'approval_workflow_steps has RLS enabled');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. RLS — approval_workflow_steps policy existence
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT has_policy('public', 'approval_workflow_steps', 'approval_workflow_steps_select_authenticated',
  'approval_workflow_steps has authenticated select policy');
SELECT has_policy('public', 'approval_workflow_steps', 'approval_workflow_steps_insert_admin',
  'approval_workflow_steps has admin insert policy');
SELECT has_policy('public', 'approval_workflow_steps', 'approval_workflow_steps_update_admin',
  'approval_workflow_steps has admin update policy');
SELECT has_policy('public', 'approval_workflow_steps', 'approval_workflow_steps_delete_admin',
  'approval_workflow_steps has admin delete policy');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. RLS — authenticated (non-admin) can SELECT template steps
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.approval_workflow_steps WHERE workflow_id = '11111111-1111-1111-1111-111111111111'$$,
  'non-admin can read approval_workflow_steps'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. RLS — non-admin cannot INSERT template steps
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.approval_workflow_steps (workflow_id, step_order, name, approver_role, approver_kind) VALUES ('11111111-1111-1111-1111-111111111111', 99, 'Bad Step', 'admin', 'role')$$,
  '42501',
  NULL,
  'non-admin cannot insert approval_workflow_steps'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. RLS — admin can INSERT template steps
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.approval_workflow_steps (workflow_id, step_order, name, approver_role, approver_kind) VALUES ('11111111-1111-1111-1111-111111111111', 2, 'Legal Step', 'admin', 'role')$$,
  'admin can insert approval_workflow_steps'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 11. RLS — non-admin cannot UPDATE template steps
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.approval_workflow_steps SET name = 'Hacked' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT name FROM public.approval_workflow_steps WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Manager Step',
  'non-admin cannot update approval_workflow_steps (silently blocked)'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 12. RLS — non-admin cannot DELETE template steps
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.approval_workflow_steps WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.approval_workflow_steps WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'non-admin cannot delete approval_workflow_steps (silently blocked)'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 13. RLS — approver_user_ids[] support: user in array can read their step
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.approval_steps WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'$$,
  'user in approver_user_ids[] can read their step'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 14. RLS — approver_user_ids[]: user in array can read the instance
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.approval_instances WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'$$,
  'user in approver_user_ids[] can read the instance'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 15. Constraint — duplicate step_order in same workflow is rejected
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.approval_workflow_steps (workflow_id, step_order, name, approver_role, approver_kind) VALUES ('11111111-1111-1111-1111-111111111111', 1, 'Duplicate Order', 'admin', 'role')$$,
  '23505',
  NULL,
  'duplicate step_order in same workflow is rejected'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 16. Constraint — step with NULL approver AND NULL approver_user_ids is rejected
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
-- Insert a fresh instance first
INSERT INTO public.approval_instances (id, workflow_id, entity_type, entity_id, status, triggered_by_user_id, created_by, updated_by)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', '11111111-1111-1111-1111-111111111111', 'opportunity', 'd0000002-0002-0002-0002-000000000002', 'pending', '88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', '77777777-7777-7777-7777-777777777777');

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.approval_steps (id, instance_id, step_order) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 1)$$,
  '23514',
  NULL,
  'step with NULL approver_role, NULL approver_user_id, and NULL approver_user_ids is rejected'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 17. Constraint — step with only approver_user_ids is accepted
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.approval_steps (id, instance_id, step_order, approver_user_ids, mode) VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 1, ARRAY['88888888-8888-8888-8888-888888888888']::uuid[], 'any_one')$$,
  'step with only approver_user_ids (no role or single user) is accepted'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 18. mode defaults to all_required
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
INSERT INTO public.approval_workflow_steps (workflow_id, step_order, name, approver_role, approver_kind)
VALUES ('11111111-1111-1111-1111-111111111111', 3, 'Default Mode Test', 'admin', 'role');
SELECT is(
  (SELECT mode::text FROM public.approval_workflow_steps WHERE step_order = 3 AND workflow_id = '11111111-1111-1111-1111-111111111111'),
  'all_required',
  'approval_workflow_steps.mode defaults to all_required'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 19. enforce_gate defaults to false
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
INSERT INTO public.approval_workflows (id, name, entity_type)
VALUES ('22222222-2222-2222-2222-222222222222', 'Gate Default Test', 'opportunity');
SELECT is(
  (SELECT enforce_gate FROM public.approval_workflows WHERE id = '22222222-2222-2222-2222-222222222222'),
  false,
  'approval_workflows.enforce_gate defaults to false'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 20. FK cascade — deleting a workflow deletes its template steps
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
INSERT INTO public.approval_workflows (id, name, entity_type)
VALUES ('33333333-3333-3333-3333-333333333333', 'Cascade Test', 'opportunity');
INSERT INTO public.approval_workflow_steps (workflow_id, step_order, name, approver_role, approver_kind)
VALUES ('33333333-3333-3333-3333-333333333333', 1, 'Cascade Child', 'admin', 'role');

DELETE FROM public.approval_workflows WHERE id = '33333333-3333-3333-3333-333333333333';
SELECT is_empty(
  $$SELECT id FROM public.approval_workflow_steps WHERE workflow_id = '33333333-3333-3333-3333-333333333333'$$,
  'deleting a workflow cascades to its template steps'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 21. Seed — East Asia Budget Gate workflow exists
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.approval_workflows WHERE entity_type = 'opportunity' AND trigger_stage = 'meet_and_present' AND applies_to_entity_id = 'e0000001-0001-0001-0001-000000000001'$$,
  'East Asia Budget Gate workflow seeded'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 22. Seed — East Asia Budget Gate has template steps
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT aws.id FROM public.approval_workflow_steps aws JOIN public.approval_workflows aw ON aw.id = aws.workflow_id WHERE aw.entity_type = 'opportunity' AND aw.trigger_stage = 'meet_and_present' AND aw.applies_to_entity_id = 'e0000001-0001-0001-0001-000000000001'$$,
  'East Asia Budget Gate has template steps'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 23. Seed — East Asia Closure Gate workflow exists
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.approval_workflows WHERE entity_type = 'opportunity' AND trigger_stage = 'verbal_agreement' AND applies_to_entity_id = 'e0000001-0001-0001-0001-000000000001'$$,
  'East Asia Closure Gate workflow seeded'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 24. Seed — East Asia Closure Gate has template steps
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT aws.id FROM public.approval_workflow_steps aws JOIN public.approval_workflows aw ON aw.id = aws.workflow_id WHERE aw.entity_type = 'opportunity' AND aw.trigger_stage = 'verbal_agreement' AND aw.applies_to_entity_id = 'e0000001-0001-0001-0001-000000000001'$$,
  'East Asia Closure Gate has template steps'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 25. Anon cannot read approval_workflow_steps
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT id FROM public.approval_workflow_steps WHERE true$$,
  'anon cannot read approval_workflow_steps'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 26. Audit trigger created_by is set on template step INSERT
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
INSERT INTO public.approval_workflows (id, name, entity_type)
VALUES ('44444444-4444-4444-4444-444444444444', 'Audit Test WF', 'opportunity');

INSERT INTO public.approval_workflow_steps (id, workflow_id, step_order, name, approver_role, approver_kind)
VALUES ('99999999-9999-9999-9999-999999999999', '44444444-4444-4444-4444-444444444444', 1, 'Audit Test Step', 'admin', 'role');

SELECT is(
  (SELECT created_by FROM public.approval_workflow_steps WHERE id = '99999999-9999-9999-9999-999999999999'),
  '77777777-7777-7777-7777-777777777777'::uuid,
  'created_by set on approval_workflow_steps INSERT'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 27. Audit log captured approval_workflow_steps changes
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_log WHERE table_name = 'approval_workflow_steps' AND row_id = '99999999-9999-9999-9999-999999999999'),
  '>=',
  1,
  'audit_log captured approval_workflow_steps insert'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 28. approval_workflows can set trigger_stage
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
INSERT INTO public.approval_workflows (id, name, entity_type, trigger_stage)
VALUES ('55555555-5555-5555-5555-555555555555', 'Trigger Stage Test', 'opportunity', 'propose');
SELECT is(
  (SELECT trigger_stage::text FROM public.approval_workflows WHERE id = '55555555-5555-5555-5555-555555555555'),
  'propose',
  'approval_workflows.trigger_stage accepts deal_stage enum values'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 29. approval_workflows can set applies_to_entity_id
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT applies_to_entity_id FROM public.approval_workflows WHERE id = '55555555-5555-5555-5555-555555555555'),
  NULL,
  'applies_to_entity_id defaults to NULL'
);

UPDATE public.approval_workflows SET applies_to_entity_id = 'e0000001-0001-0001-0001-000000000001' WHERE id = '55555555-5555-5555-5555-555555555555';
SELECT is(
  (SELECT applies_to_entity_id FROM public.approval_workflows WHERE id = '55555555-5555-5555-5555-555555555555'),
  'e0000001-0001-0001-0001-000000000001'::uuid,
  'applies_to_entity_id can be set to a valid entity'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 30. approval_workflow_steps.approver_user_ids accepts uuid arrays
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
INSERT INTO public.approval_workflow_steps (workflow_id, step_order, name, approver_user_ids, mode)
VALUES ('44444444-4444-4444-4444-444444444444', 2, 'Multi-Approver Step', ARRAY['88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777']::uuid[], 'any_one');
SELECT is(
  (SELECT array_length(approver_user_ids, 1)::int FROM public.approval_workflow_steps WHERE workflow_id = '44444444-4444-4444-4444-444444444444' AND step_order = 2),
  2,
  'approver_user_ids array accepts multiple UUIDs'
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 31. approval_step_mode enum values are valid
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
INSERT INTO public.approval_workflow_steps (workflow_id, step_order, name, approver_role, approver_kind, mode)
VALUES ('44444444-4444-4444-4444-444444444444', 3, 'Any One Test', 'admin', 'role', 'any_one');
SELECT is(
  (SELECT mode::text FROM public.approval_workflow_steps WHERE workflow_id = '44444444-4444-4444-4444-444444444444' AND step_order = 3),
  'any_one',
  'approval_step_mode any_one is accepted'
);

SELECT * FROM finish();

ROLLBACK;
