-- supabase/tests/users_entity_admin.test.sql
-- pgTAP: Entity Admin editing users is confined to their own entity, and cannot
-- assign roles or move users out of the entity (ORR-619).
--
-- Run with: supabase test db

BEGIN;

SELECT plan(6);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('aa000001-0001-0001-0001-000000000001', 'super@nodwin.com',  '{"full_name":"Super"}'),
  ('bb000002-0002-0002-0002-000000000002', 'eadmin@nodwin.com', '{"full_name":"EAdmin A"}'),
  ('cc000003-0003-0003-0003-000000000003', 'repa@nodwin.com',   '{"full_name":"Rep A"}'),
  ('dd000004-0004-0004-0004-000000000004', 'repb@nodwin.com',   '{"full_name":"Rep B"}')
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name, base_currency)
VALUES
  ('ea000001-0001-0001-0001-000000000001', 'Entity A', 'USD'),
  ('eb000002-0002-0002-0002-000000000002', 'Entity B', 'USD')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('aa000001-0001-0001-0001-000000000001', 'super@nodwin.com',  'Super',   'admin',        NULL),
  ('bb000002-0002-0002-0002-000000000002', 'eadmin@nodwin.com', 'EAdmin A','entity_admin', 'ea000001-0001-0001-0001-000000000001'),
  ('cc000003-0003-0003-0003-000000000003', 'repa@nodwin.com',   'Rep A',   'sales_rep',    'ea000001-0001-0001-0001-000000000001'),
  ('dd000004-0004-0004-0004-000000000004', 'repb@nodwin.com',   'Rep B',   'sales_rep',    'eb000002-0002-0002-0002-000000000002')
ON CONFLICT (id) DO UPDATE SET
  primary_role      = EXCLUDED.primary_role,
  primary_entity_id = EXCLUDED.primary_entity_id;

-- ── As the Entity Admin for Entity A ─────────────────────────────────────────
SELECT tests.as_user('eadmin@nodwin.com');
SET LOCAL ROLE authenticated;

-- 1. Can edit a same-entity user's name.
UPDATE public.users SET full_name = 'Rep A (edited)' WHERE id = 'cc000003-0003-0003-0003-000000000003';
SELECT is(
  (SELECT full_name FROM public.users WHERE id = 'cc000003-0003-0003-0003-000000000003'),
  'Rep A (edited)',
  'entity_admin can edit a same-entity user name'
);

-- 2. Cannot change a user's role (prevent_role_escalation trigger).
SELECT throws_ok(
  $$UPDATE public.users SET primary_role = 'sales_manager' WHERE id = 'cc000003-0003-0003-0003-000000000003'$$,
  '42501',
  NULL,
  'entity_admin cannot change a user role'
);

-- 3. Cannot move a user OUT of their entity (WITH CHECK).
SELECT throws_ok(
  $$UPDATE public.users SET primary_entity_id = 'eb000002-0002-0002-0002-000000000002' WHERE id = 'cc000003-0003-0003-0003-000000000003'$$,
  '42501',
  NULL,
  'entity_admin cannot move a user to another entity'
);

-- 4. Cannot edit a user in ANOTHER entity (RLS USING → 0 rows, silently blocked).
UPDATE public.users SET full_name = 'hacked' WHERE id = 'dd000004-0004-0004-0004-000000000004';
SELECT tests.as_user('super@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT full_name FROM public.users WHERE id = 'dd000004-0004-0004-0004-000000000004'),
  'Rep B',
  'entity_admin cannot edit a user in another entity (silently blocked)'
);

-- ── As the Super Admin ───────────────────────────────────────────────────────
-- 5. Can change any user's role.
UPDATE public.users SET primary_role = 'sales_manager' WHERE id = 'cc000003-0003-0003-0003-000000000003';
SELECT is(
  (SELECT primary_role FROM public.users WHERE id = 'cc000003-0003-0003-0003-000000000003')::text,
  'sales_manager',
  'super admin can change a user role'
);

-- 6. Can edit a user in any entity.
UPDATE public.users SET full_name = 'Rep B (by super)' WHERE id = 'dd000004-0004-0004-0004-000000000004';
SELECT is(
  (SELECT full_name FROM public.users WHERE id = 'dd000004-0004-0004-0004-000000000004'),
  'Rep B (by super)',
  'super admin can edit a user in any entity'
);

SELECT * FROM finish();

ROLLBACK;
