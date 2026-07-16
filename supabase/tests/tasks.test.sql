-- supabase/tests/tasks.test.sql
-- pgTAP for tasks (ORR-725): RLS (own/assigned/admin) + insert-as-creator + the
-- title CHECK. HIGH-RISK FILE -- see AGENTS.md §6.

BEGIN;

SELECT plan(9);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   '{"full_name":"Rep"}'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', '{"full_name":"Other"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   'Rep',   'sales_rep', NULL),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', 'Other', 'sales_rep', NULL),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin', 'admin',     NULL)
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.tasks (id, title, assignee_user_id, created_by) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'Rep personal task', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('a2222222-2222-2222-2222-222222222222', 'Assigned to other', '33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111');

-- 1. RLS enabled
SELECT has_rls('public', 'tasks', 'tasks has RLS');

-- 2. Creator/assignee reads own task
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.tasks WHERE id = 'a1111111-1111-1111-1111-111111111111'$$,
  'creator/assignee reads own task');

-- 3. A non-owner cannot read someone else's personal task
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.tasks WHERE id = 'a1111111-1111-1111-1111-111111111111'$$,
  'non-owner cannot read a task');

-- 4. But the assignee reads the task assigned to them
SELECT isnt_empty(
  $$SELECT id FROM public.tasks WHERE id = 'a2222222-2222-2222-2222-222222222222'$$,
  'assignee reads their assigned task');

-- 5. Admin reads any task
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.tasks WHERE id = 'a1111111-1111-1111-1111-111111111111'$$,
  'admin reads any task');

-- 6. A user can create a task with themselves as creator
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.tasks (title, assignee_user_id, created_by)
    VALUES ('New follow-up', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111')$$,
  'creator can insert own task');

-- 7. Cannot insert a task attributed to another creator
SELECT throws_ok(
  $$INSERT INTO public.tasks (title, assignee_user_id, created_by)
    VALUES ('Spoofed', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333')$$,
  '42501', NULL, 'cannot insert a task as another creator');

-- 8. The assignee can complete their assigned task
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.tasks SET status = 'done' WHERE id = 'a2222222-2222-2222-2222-222222222222';
SELECT is(
  (SELECT status FROM public.tasks WHERE id = 'a2222222-2222-2222-2222-222222222222'),
  'done',
  'assignee can complete their task');

-- 9. A blank title is rejected
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.tasks (title, assignee_user_id, created_by)
    VALUES ('   ', '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111')$$,
  '23514', NULL, 'blank title is rejected');

SELECT * FROM finish();

ROLLBACK;
