-- supabase/tests/entity_admin_rls.test.sql
-- pgTAP: two-tier admin write RLS on reporting_currency_settings (ORR-618).
-- Proves an Entity Admin is confined to their own entity and cannot touch the
-- group-wide default, while a Super Admin can do everything.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(9);

-- ── Fixtures ─────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('aa000001-0001-0001-0001-000000000001', 'super@nodwin.com',  '{"full_name":"Super Admin"}'),
  ('bb000002-0002-0002-0002-000000000002', 'eadmin@nodwin.com', '{"full_name":"Entity Admin A"}')
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
  ('aa000001-0001-0001-0001-000000000001', 'super@nodwin.com',  'Super Admin',    'admin',        NULL),
  ('bb000002-0002-0002-0002-000000000002', 'eadmin@nodwin.com', 'Entity Admin A', 'entity_admin', 'ea000001-0001-0001-0001-000000000001')
ON CONFLICT (id) DO UPDATE SET
  primary_role      = EXCLUDED.primary_role,
  primary_entity_id = EXCLUDED.primary_entity_id;

-- ── As the Entity Admin for Entity A ─────────────────────────────────────────
SELECT tests.as_user('eadmin@nodwin.com');
SET LOCAL ROLE authenticated;

-- 1. Can set an override for their OWN entity.
SELECT lives_ok(
  $$INSERT INTO public.reporting_currency_settings (entity_id, currency_code) VALUES ('ea000001-0001-0001-0001-000000000001', 'INR')$$,
  'entity_admin can set an override for their own entity'
);

-- 2. Cannot set an override for ANOTHER entity.
SELECT throws_ok(
  $$INSERT INTO public.reporting_currency_settings (entity_id, currency_code) VALUES ('eb000002-0002-0002-0002-000000000002', 'INR')$$,
  '42501',
  NULL,
  'entity_admin cannot set an override for another entity'
);

-- 3. Cannot set the group-wide default (entity_id NULL).
SELECT throws_ok(
  $$INSERT INTO public.reporting_currency_settings (entity_id, currency_code) VALUES (NULL, 'INR')$$,
  '42501',
  NULL,
  'entity_admin cannot set the group-wide default'
);

-- 4. Can UPDATE their own entity's override.
UPDATE public.reporting_currency_settings SET currency_code = 'USD'
  WHERE entity_id = 'ea000001-0001-0001-0001-000000000001';
SELECT is(
  (SELECT currency_code FROM public.reporting_currency_settings WHERE entity_id = 'ea000001-0001-0001-0001-000000000001'),
  'USD',
  'entity_admin can update their own entity override'
);

-- 5. Can DELETE their own entity's override.
SELECT lives_ok(
  $$DELETE FROM public.reporting_currency_settings WHERE entity_id = 'ea000001-0001-0001-0001-000000000001'$$,
  'entity_admin can delete their own entity override'
);

-- ── As the Super Admin ───────────────────────────────────────────────────────
SELECT tests.as_user('super@nodwin.com');
SET LOCAL ROLE authenticated;

-- 6. Can set the group-wide default.
SELECT lives_ok(
  $$INSERT INTO public.reporting_currency_settings (entity_id, currency_code) VALUES (NULL, 'USD')$$,
  'super admin can set the group-wide default'
);

-- 7. Can set an override for any entity.
SELECT lives_ok(
  $$INSERT INTO public.reporting_currency_settings (entity_id, currency_code) VALUES ('eb000002-0002-0002-0002-000000000002', 'INR')$$,
  'super admin can set an override for any entity'
);

-- 8. Can update another entity's override.
UPDATE public.reporting_currency_settings SET currency_code = 'USD'
  WHERE entity_id = 'eb000002-0002-0002-0002-000000000002';
SELECT is(
  (SELECT currency_code FROM public.reporting_currency_settings WHERE entity_id = 'eb000002-0002-0002-0002-000000000002'),
  'USD',
  'super admin can update any entity override'
);

-- 9. Can delete the group-wide default.
SELECT lives_ok(
  $$DELETE FROM public.reporting_currency_settings WHERE entity_id IS NULL$$,
  'super admin can delete the group-wide default'
);

SELECT * FROM finish();

ROLLBACK;
