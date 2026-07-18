-- supabase/seed/sandbox.sql
-- Local development seed for the Nodwin CRM.
-- Run via: supabase db reset  (or supabase db seed)
--
-- Currencies are seeded in migration 20260505000002_currencies.sql.
-- Relationship types are seeded in migration 20260618000001.
-- Roles / permissions are seeded in migration 20260707030000.
--
-- This seed intentionally contains ONLY real org scaffolding + a login:
--   1. The 10 Nodwin Group legal entities.
--   2. Their business units (sales / ops / revenue-recognition).
--   3. A single admin user so you can log in and start entering real data.
-- No fake accounts / opportunities / demo users. Idempotent (ON CONFLICT).

-- ===========================================================================
-- 1. ENTITIES -- 10 Nodwin Group legal entities
-- ===========================================================================

INSERT INTO public.entities (
  id, name, legal_name, country, base_currency,
  fiscal_year_start_month, active, custom_data,
  display_name, logo_url, email_footer
) VALUES
  ('e0000001-0001-0001-0001-000000000001', 'NG India', 'Nodwin Gaming Sports Private Limited', 'IN', 'INR', 4, true, '{"timezone":"Asia/Kolkata","region":"APAC"}'::jsonb, 'Nodwin Gaming India', NULL, NULL),
  ('e0000002-0002-0002-0002-000000000002', 'NG Spr', 'Nodwin Gaming Singapore Pte Ltd', 'SG', 'SGD', 4, true, '{"timezone":"Asia/Singapore","region":"APAC"}'::jsonb, 'Nodwin Gaming Singapore', NULL, NULL),
  ('e0000003-0003-0003-0003-000000000003', 'Unpause', 'Unpause Media FZ-LLC', 'AE', 'AED', 1, true, '{"timezone":"Asia/Dubai","region":"MENA"}'::jsonb, NULL, NULL, NULL),
  ('e0000004-0004-0004-0004-000000000004', 'PSH', 'PSH Events LLC', 'SA', 'SAR', 1, true, '{"timezone":"Asia/Riyadh","region":"MENA"}'::jsonb, NULL, NULL, NULL),
  ('e0000005-0005-0005-0005-000000000005', 'Trinity', 'Trinity Gaming UK Ltd', 'GB', 'GBP', 4, true, '{"timezone":"Europe/London","region":"EMEA"}'::jsonb, 'Trinity Gaming', NULL, NULL),
  ('e0000006-0006-0006-0006-000000000006', 'AFK', 'AFK Esports (Pty) Ltd', 'ZA', 'ZAR', 3, true, '{"timezone":"Africa/Johannesburg","region":"EMEA"}'::jsonb, NULL, NULL, NULL),
  ('e0000007-0007-0007-0007-000000000007', 'Branded', 'Branded Media Inc', 'US', 'USD', 1, true, '{"timezone":"America/New_York","region":"AMER"}'::jsonb, 'Branded Media', NULL, NULL),
  ('e0000008-0008-0008-0008-000000000008', 'Nodwin Mena', 'Nodwin Gaming MENA FZ-LLC', 'AE', 'AED', 1, true, '{"timezone":"Asia/Dubai","region":"MENA"}'::jsonb, 'Nodwin Gaming MENA', NULL, NULL),
  ('e0000009-0009-0009-0009-000000000009', 'Starladder', 'Starladder Ltd', 'CY', 'EUR', 1, true, '{"timezone":"Asia/Nicosia","region":"EMEA"}'::jsonb, NULL, NULL, NULL),
  ('e0000010-0010-0010-0010-000000000010', 'Comic Con', 'Comic Con India Pvt Ltd', 'IN', 'INR', 4, true, '{"timezone":"Asia/Kolkata","region":"APAC"}'::jsonb, 'Comic Con India', NULL, NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, legal_name = EXCLUDED.legal_name,
  country = EXCLUDED.country, base_currency = EXCLUDED.base_currency,
  fiscal_year_start_month = EXCLUDED.fiscal_year_start_month,
  active = EXCLUDED.active, custom_data = EXCLUDED.custom_data,
  display_name = EXCLUDED.display_name,
  logo_url = EXCLUDED.logo_url,
  email_footer = EXCLUDED.email_footer;

-- ===========================================================================
-- 2. BUSINESS UNITS -- per-entity sales, ops, and revenue-recognition units
-- ===========================================================================

INSERT INTO public.business_units (
  id, name, entity_id, kind, parent_id, manager_user_id, active, custom_data
) VALUES
  ('b0010001-0001-0001-0001-000000000001', 'India Sales', 'e0000001-0001-0001-0001-000000000001', 'sales', NULL, NULL, true, '{}'::jsonb),
  ('b0010002-0002-0002-0002-000000000002', 'India Ops', 'e0000001-0001-0001-0001-000000000001', 'ops', NULL, NULL, true, '{}'::jsonb),
  ('b0010003-0003-0003-0003-000000000003', 'India RevRec', 'e0000001-0001-0001-0001-000000000001', 'revenue_recognition', NULL, NULL, true, '{}'::jsonb),
  ('b0020001-0001-0001-0001-000000000001', 'NG Spr Sales', 'e0000002-0002-0002-0002-000000000002', 'sales', NULL, NULL, true, '{}'::jsonb),
  ('b0020002-0002-0002-0002-000000000002', 'NG Spr RevRec', 'e0000002-0002-0002-0002-000000000002', 'revenue_recognition', NULL, NULL, true, '{}'::jsonb),
  ('b00000e1-00e1-00e1-00e1-0000000000e1', 'East Asia', 'e0000001-0001-0001-0001-000000000001', 'sales', NULL, NULL, true, '{}'::jsonb),
  ('b00000e2-00e2-00e2-00e2-0000000000e2', 'East Asia Ops', 'e0000001-0001-0001-0001-000000000001', 'ops', NULL, NULL, true, '{}'::jsonb),
  ('b00000a1-00a1-00a1-00a1-0000000000a1', 'Trimax', 'e0000007-0007-0007-0007-000000000007', 'sales', NULL, NULL, true, '{}'::jsonb),
  ('b00000c1-00c1-00c1-00c1-0000000000c1', 'Sages', 'e0000005-0005-0005-0005-000000000005', 'sales', NULL, NULL, true, '{}'::jsonb),
  ('b0030001-0001-0001-0001-000000000001', 'Unpause Sales', 'e0000003-0003-0003-0003-000000000003', 'sales', NULL, NULL, true, '{}'::jsonb),
  ('b0040001-0001-0001-0001-000000000001', 'PSH Sales', 'e0000004-0004-0004-0004-000000000004', 'sales', NULL, NULL, true, '{}'::jsonb),
  ('b0070001-0001-0001-0001-000000000001', 'Branded Sales', 'e0000007-0007-0007-0007-000000000007', 'sales', NULL, NULL, true, '{}'::jsonb),
  ('b0080001-0001-0001-0001-000000000001', 'MENA Sales', 'e0000008-0008-0008-0008-000000000008', 'sales', NULL, NULL, true, '{}'::jsonb),
  ('b0090001-0001-0001-0001-000000000001', 'Starladder Sales', 'e0000009-0009-0009-0009-000000000009', 'sales', NULL, NULL, true, '{}'::jsonb),
  ('b0100001-0001-0001-0001-000000000001', 'Comic Con Sales', 'e0000010-0010-0010-0010-000000000010', 'sales', NULL, NULL, true, '{}'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, entity_id = EXCLUDED.entity_id,
  kind = EXCLUDED.kind, parent_id = EXCLUDED.parent_id,
  manager_user_id = EXCLUDED.manager_user_id,
  active = EXCLUDED.active, custom_data = EXCLUDED.custom_data;

-- ===========================================================================
-- 3. ADMIN LOGIN -- real Super Admin so you can sign in and enter real data
-- ===========================================================================
-- ⚠️  SECURITY (ORR-778): this creates a Super Admin. The password defaults to a
-- well-known dev value for the LOCAL sandbox only. NEVER apply this seed to a
-- shared, staging, or internet-facing database with the default password — it
-- is a trivial full-account takeover. For any non-local bootstrap, pass a strong
-- password via a session GUC, e.g.:
--     PGOPTIONS="-c seed.admin_password=$(openssl rand -base64 24)" \
--       psql "$DB_URL" -f supabase/seed/sandbox.sql
-- (and prefer creating the bootstrap admin through Supabase Auth instead — see
-- deploy/SUPABASE-SETUP.md).
--
-- auth.users insert fires handle_new_auth_user(), which creates the matching
-- public.users row as sales_rep. We then promote it to the admin role; the
-- a_sync_primary_role_from_role_id trigger syncs primary_role from base_role,
-- and prevent_role_escalation() allows it because the seed runs with no JWT.

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  'a0000000-0000-4000-8000-000000000001',
  'authenticated', 'authenticated',
  'orrin.xu@nodwin.com',
  -- Overridable: set `seed.admin_password` (GUC) for a non-local bootstrap;
  -- falls back to the local-sandbox dev default. See the security note above.
  extensions.crypt(
    coalesce(current_setting('seed.admin_password', true), '12345678'),
    extensions.gen_salt('bf')
  ),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Orrin Xu"}'::jsonb,
  '', '', '', ''
)
ON CONFLICT (id) DO NOTHING;

-- Email identity (password grant + email provider lookups expect this row).
INSERT INTO auth.identities (
  id, user_id, provider_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  '{"sub":"a0000000-0000-4000-8000-000000000001","email":"orrin.xu@nodwin.com","email_verified":true}'::jsonb,
  'email', now(), now(), now()
)
ON CONFLICT (provider_id, provider) DO NOTHING;

-- Promote the auto-created public.users row to Super Admin and place it in NG India.
UPDATE public.users SET
  full_name = 'Orrin Xu',
  role_id = (SELECT id FROM public.roles WHERE key = 'admin' AND is_system = true),
  primary_entity_id = 'e0000001-0001-0001-0001-000000000001',
  primary_business_unit_id = 'b0010001-0001-0001-0001-000000000001'
WHERE id = 'a0000000-0000-4000-8000-000000000001';
