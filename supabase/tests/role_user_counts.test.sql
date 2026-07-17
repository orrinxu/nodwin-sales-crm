-- supabase/tests/role_user_counts.test.sql
-- pgTAP for role_user_counts() (ORR-761): the single GROUP BY that replaced the
-- per-role count round-trips in getRoles.
-- HIGH-RISK FILE -- see AGENTS.md §6.

BEGIN;

SELECT plan(3);

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

-- Two custom roles; assign users so role A has 2 members and role B has 1.
INSERT INTO public.roles (id, key, label, is_system, base_role) VALUES
  ('76100000-0000-0000-0000-0000000000a0', 'role_a', 'Role A', false, 'sales_rep'),
  ('76100000-0000-0000-0000-0000000000b0', 'role_b', 'Role B', false, 'sales_rep');

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('76100000-0000-0000-0000-000000000001', 'u1@n.com', '{}'),
  ('76100000-0000-0000-0000-000000000002', 'u2@n.com', '{}'),
  ('76100000-0000-0000-0000-000000000003', 'u3@n.com', '{}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role, role_id) VALUES
  ('76100000-0000-0000-0000-000000000001', 'u1@n.com', 'U1', 'sales_rep', '76100000-0000-0000-0000-0000000000a0'),
  ('76100000-0000-0000-0000-000000000002', 'u2@n.com', 'U2', 'sales_rep', '76100000-0000-0000-0000-0000000000a0'),
  ('76100000-0000-0000-0000-000000000003', 'u3@n.com', 'U3', 'sales_rep', '76100000-0000-0000-0000-0000000000b0')
ON CONFLICT (id) DO UPDATE SET role_id = EXCLUDED.role_id;

SELECT results_eq(
  $$ SELECT user_count::int FROM public.role_user_counts()
     WHERE role_id = '76100000-0000-0000-0000-0000000000a0' $$,
  $$ VALUES (2) $$,
  'role A tallies its 2 assigned users');

SELECT results_eq(
  $$ SELECT user_count::int FROM public.role_user_counts()
     WHERE role_id = '76100000-0000-0000-0000-0000000000b0' $$,
  $$ VALUES (1) $$,
  'role B tallies its 1 assigned user');

-- Only roles WITH assignments appear (users.role_id IS NOT NULL grouped) — a
-- role with no members simply has no row (getRoles defaults it to 0).
SELECT is_empty(
  $$ SELECT 1 FROM public.role_user_counts() WHERE role_id IS NULL $$,
  'no NULL-role bucket');

SELECT * FROM finish();
ROLLBACK;
