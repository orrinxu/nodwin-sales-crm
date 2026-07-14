-- supabase/tests/audit_log_table_names.test.sql
-- pgTAP: audit_log_table_names() respects audit_log's admin-only RLS (ORR-700).
--
-- Run with: supabase test db

BEGIN;

SELECT plan(2);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a7000000-0000-0000-0000-000000000001', 'admin700@nodwin.com', '{"full_name":"Admin"}'),
  ('b7000000-0000-0000-0000-000000000001', 'rep700@nodwin.com',   '{"full_name":"Rep"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role) VALUES
  ('a7000000-0000-0000-0000-000000000001', 'admin700@nodwin.com', 'Admin', 'admin'),
  ('b7000000-0000-0000-0000-000000000001', 'rep700@nodwin.com',   'Rep',   'sales_rep')
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

-- Seed one audit row so the admin has something to see (clean DB has none).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.audit_log (table_name, operation, actor_source)
VALUES ('opportunities', 'INSERT', 'system');

-- Admin sees audited table names (function is SECURITY INVOKER → RLS applies).
SELECT tests.as_user('admin700@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$ SELECT 1 FROM public.audit_log_table_names() $$,
  'admin sees audited table names');

-- A non-admin gets nothing (audit_log SELECT is admin-only).
SELECT tests.as_user('rep700@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$ SELECT 1 FROM public.audit_log_table_names() $$,
  'non-admin gets no audited table names (RLS)');

SELECT * FROM finish();
ROLLBACK;
