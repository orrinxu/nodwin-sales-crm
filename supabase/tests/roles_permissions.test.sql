-- supabase/tests/roles_permissions.test.sql
-- pgTAP for roles/permissions RLS + has_permission() + primary_role sync.
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(13);

-- ── Fixtures — the on_auth_user_created trigger creates public.users rows
--    (role_id defaulting to the sales_rep system role). ─────────────────────────
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('fa000000-0000-0000-0000-000000000001', 'rp-rep@nodwin.com',   '{"full_name":"RP Rep"}'),
  ('fb000000-0000-0000-0000-000000000002', 'rp-admin@nodwin.com', '{"full_name":"RP Admin"}')
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

-- Promote the admin fixture (service-role update bypasses the escalation guard).
UPDATE public.users
SET role_id = (SELECT id FROM public.roles WHERE key = 'admin')
WHERE id = 'fb000000-0000-0000-0000-000000000002';

-- A finance-based custom role, used for the sync test.
INSERT INTO public.roles (id, key, label, base_role, is_system)
VALUES ('cf000000-0000-0000-0000-0000000000ff', 'regional_finance', 'Regional Finance', 'finance', false)
ON CONFLICT (key) DO NOTHING;

-- ── RLS shape ────────────────────────────────────────────────────────────────
SELECT has_rls('public', 'roles', 'roles has RLS');
SELECT has_rls('public', 'role_permissions', 'role_permissions has RLS');

-- ── As a sales_rep: read allowed, writes denied ──────────────────────────────
SELECT tests.as_user('rp-rep@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT isnt_empty($$ SELECT 1 FROM public.roles LIMIT 1 $$, 'rep can read roles');

SELECT throws_ok(
  $$ INSERT INTO public.roles (key, label, base_role) VALUES ('sneaky','Sneaky','sales_rep') $$,
  '42501', NULL, 'rep cannot create a role');

SELECT throws_ok(
  $$ INSERT INTO public.role_permissions (role_id, permission_key)
     VALUES ((SELECT id FROM public.roles WHERE key='sales_rep'), 'opportunities.delete') $$,
  '42501', NULL, 'rep cannot grant a permission');

-- ── has_permission: the rep holds sales_rep's seeded permissions ─────────────
SELECT ok(public.has_permission('opportunities.edit'), 'rep has opportunities.edit (seeded)');
SELECT ok(NOT public.has_permission('opportunities.delete'), 'rep lacks opportunities.delete');

-- rep cannot change their own role_id (escalation guard)
SELECT throws_ok(
  $$ UPDATE public.users SET role_id = (SELECT id FROM public.roles WHERE key='admin')
     WHERE id = 'fa000000-0000-0000-0000-000000000001' $$,
  '42501', NULL, 'rep cannot change their own role_id');

-- ── As admin: writes allowed, bypasses the matrix, cannot delete system roles ─
SELECT tests.as_user('rp-admin@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT ok(public.has_permission('opportunities.delete'), 'admin bypasses the matrix (all permissions)');

SELECT lives_ok(
  $$ INSERT INTO public.roles (key, label, base_role) VALUES ('custom_a','Custom A','sales_rep') $$,
  'admin can create a custom role');

SELECT throws_ok(
  $$ DELETE FROM public.roles WHERE key = 'sales_rep' $$,
  '42501', NULL, 'system roles cannot be deleted');

-- primary_role stays in sync with the assigned role's base_role
SELECT lives_ok(
  $$ UPDATE public.users SET role_id = 'cf000000-0000-0000-0000-0000000000ff'
     WHERE id = 'fa000000-0000-0000-0000-000000000001' $$,
  'admin can assign a custom role to a user');

SELECT is(
  (SELECT primary_role::text FROM public.users WHERE id = 'fa000000-0000-0000-0000-000000000001'),
  'finance',
  'primary_role synced to the assigned role''s base_role');

SELECT * FROM finish();
ROLLBACK;
