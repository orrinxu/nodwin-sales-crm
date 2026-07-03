-- supabase/tests/email_transport.test.sql
-- pgTAP: email_transport is admin-only — secrets never leak to non-admins.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(4);

INSERT INTO auth.users (id, email) VALUES
  ('ea000000-0000-0000-0000-0000000000a1', 'admin@nodwin.com'),
  ('eb000000-0000-0000-0000-0000000000b1', 'rep@nodwin.com')
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.users (id, email, full_name, primary_role) VALUES
  ('ea000000-0000-0000-0000-0000000000a1', 'admin@nodwin.com', 'Admin', 'admin'),
  ('eb000000-0000-0000-0000-0000000000b1', 'rep@nodwin.com',   'Rep',   'sales_rep')
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

INSERT INTO public.email_transport (provider, from_address, smtp_host, smtp_username, smtp_password)
VALUES ('smtp', 'noreply@nodwin.com', 'smtp.example.com', 'user', 'super-secret-password')
ON CONFLICT DO NOTHING;

-- 1. A non-admin CANNOT read the transport row (the secret is protected).
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT smtp_password FROM public.email_transport$$,
  'a non-admin cannot read the email transport (credentials protected)'
);
-- 2. A non-admin cannot insert.
SELECT throws_ok(
  $$INSERT INTO public.email_transport (provider, from_address) VALUES ('smtp', 'x@y.com')$$,
  '42501', NULL, 'a non-admin cannot write email transport'
);

-- 3. An admin CAN read it.
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT smtp_password FROM public.email_transport$$,
  'an admin can read the email transport'
);
-- 4. An admin can update it.
SELECT lives_ok(
  $$UPDATE public.email_transport SET from_name = 'Nodwin CRM'$$,
  'an admin can update the email transport'
);

SELECT * FROM finish();

ROLLBACK;
