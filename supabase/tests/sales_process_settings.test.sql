-- supabase/tests/sales_process_settings.test.sql
-- pgTAP for sales_process_settings (ORR-753): RLS (read=all, write=admin) +
-- the stage CHECK constraint. The singleton row is seeded by the migration.
-- HIGH-RISK FILE -- see AGENTS.md §6.

BEGIN;

SELECT plan(6);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   '{"full_name":"Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   'Rep',   'sales_rep', NULL),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin', 'admin',     NULL)
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

-- 1. RLS enabled
SELECT has_rls('public', 'sales_process_settings', 'sales_process_settings has RLS');

-- 2. Sales rep can read the (seeded) singleton
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.sales_process_settings WHERE id = true$$,
  'sales rep can read sales_process_settings'
);

-- 3. Sales rep write is a no-op (admin-only update policy)
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.sales_process_settings SET line_items_override_exempts = false WHERE id = true;
SELECT is(
  (SELECT line_items_override_exempts FROM public.sales_process_settings WHERE id = true),
  true,
  'sales rep cannot change settings (update is a no-op)'
);

-- 4. Admin can update the required stage
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.sales_process_settings SET line_items_required_from_stage = 'verbal_agreement' WHERE id = true;
SELECT is(
  (SELECT line_items_required_from_stage FROM public.sales_process_settings WHERE id = true),
  'verbal_agreement',
  'admin can set the required stage'
);

-- 5. An invalid stage is rejected by the CHECK constraint
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$UPDATE public.sales_process_settings SET line_items_required_from_stage = 'bogus' WHERE id = true$$,
  '23514',
  NULL,
  'an invalid stage value is rejected'
);

-- 6. Admin can turn the rule off (NULL)
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE public.sales_process_settings SET line_items_required_from_stage = NULL WHERE id = true$$,
  'admin can turn the requirement off'
);

SELECT * FROM finish();

ROLLBACK;
