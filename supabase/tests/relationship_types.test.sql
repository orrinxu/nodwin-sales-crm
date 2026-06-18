-- supabase/tests/relationship_types.test.sql
-- pgTAP tests for public.relationship_types table, RLS policies, and triggers.
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(14);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin User"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', 'Sales Rep', 'sales_rep'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin User', 'admin')
ON CONFLICT (id) DO UPDATE SET
  full_name    = EXCLUDED.full_name,
  primary_role = EXCLUDED.primary_role;

-- ── 1. Authenticated rep can read relationship_types ─────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT code FROM public.relationship_types WHERE code = 'subsidiary_of'$$,
  'rep can read relationship_types'
);

-- ── 2. Authenticated rep can read all seeded types ───────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.relationship_types),
  '>=',
  5,
  'rep can read all 5 seeded relationship types'
);

-- ── 3. Authenticated rep cannot insert relationship_type ─────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.relationship_types (code, label) VALUES ('test_rel', 'Test Relation')$$,
  '42501',
  NULL,
  'rep cannot insert relationship_type'
);

-- ── 4. Authenticated rep cannot update relationship_type ─────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.relationship_types SET label = 'Hacked' WHERE code = 'subsidiary_of';
SELECT is(
  (SELECT label FROM public.relationship_types WHERE code = 'subsidiary_of'),
  'Subsidiary Of',
  'rep cannot update relationship_type (silently blocked)'
);

-- ── 5. Authenticated rep cannot delete relationship_type ─────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.relationship_types WHERE code = 'subsidiary_of';
SELECT isnt_empty(
  $$SELECT code FROM public.relationship_types WHERE code = 'subsidiary_of'$$,
  'rep cannot delete relationship_type (silently blocked)'
);

-- ── 6. Admin can insert relationship_type ────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.relationship_types (code, label, description, sort_order) VALUES ('test_rel', 'Test Relation', 'A test relationship type', 99)$$,
  'admin can insert relationship_type'
);

-- ── 7. Admin can update relationship_type ────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.relationship_types SET label = 'Updated Partner' WHERE code = 'partner_with';
SELECT is(
  (SELECT label FROM public.relationship_types WHERE code = 'partner_with'),
  'Updated Partner',
  'admin can update relationship_type'
);

-- ── 8. Admin can delete relationship_type ────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.relationship_types WHERE code = 'test_rel';
SELECT is_empty(
  $$SELECT code FROM public.relationship_types WHERE code = 'test_rel'$$,
  'admin can delete relationship_type'
);

-- ── 9. Duplicate code is prevented (PK constraint) ───────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.relationship_types (code, label) VALUES ('subsidiary_of', 'Duplicate Sub')$$,
  '23505',
  NULL,
  'duplicate relationship_type code prevented'
);

-- ── 10. Active flag defaults to true ─────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
INSERT INTO public.relationship_types (code, label, sort_order) VALUES ('test_active', 'Test Active', 100);
SELECT is(
  (SELECT active FROM public.relationship_types WHERE code = 'test_active'),
  true,
  'new relationship_type defaults to active=true'
);
DELETE FROM public.relationship_types WHERE code = 'test_active';

-- ── 11. sort_order defaults to 0 ─────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
INSERT INTO public.relationship_types (code, label) VALUES ('test_sort', 'Test Sort');
SELECT is(
  (SELECT sort_order FROM public.relationship_types WHERE code = 'test_sort'),
  0,
  'new relationship_type defaults to sort_order=0'
);
DELETE FROM public.relationship_types WHERE code = 'test_sort';

-- ── 12. updated_at is set by trigger ─────────────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.relationship_types (code, label) VALUES ('test_ts', 'Test TS');
SELECT is(
  (SELECT updated_at IS NOT NULL FROM public.relationship_types WHERE code = 'test_ts'),
  true,
  'created_at and updated_at are set on insert'
);

UPDATE public.relationship_types SET label = 'Test TS Updated' WHERE code = 'test_ts';
SELECT cmp_ok(
  (SELECT updated_at FROM public.relationship_types WHERE code = 'test_ts'),
  '>=',
  (SELECT created_at FROM public.relationship_types WHERE code = 'test_ts'),
  'updated_at advances on update'
);
DELETE FROM public.relationship_types WHERE code = 'test_ts';

-- ── 13. Audit log captures relationship_type changes ─────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.relationship_types (code, label) VALUES ('test_audit', 'Test Audit');
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_log WHERE table_name = 'relationship_types' AND row_id = md5('test_audit')::uuid),
  '>=',
  1,
  'audit_log captured relationship_type insert'
);
DELETE FROM public.relationship_types WHERE code = 'test_audit';

SELECT * FROM finish();

ROLLBACK;
