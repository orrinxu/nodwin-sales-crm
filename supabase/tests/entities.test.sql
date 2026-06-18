-- supabase/tests/entities.test.sql
-- pgTAP tests for public.entities table, RLS policies, and triggers.
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(16);

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

-- Insert a test entity as admin (bypass RLS with service_role).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name, legal_name, country, base_currency, fiscal_year_start_month)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'NG Spr', 'Nodwin Gaming Sports Private Limited', 'IN', 'INR', 4),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Test Inactive', 'Test Inactive Legal', 'US', 'USD', 1);

-- Soft-delete the second entity.
UPDATE public.entities SET active = false WHERE id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- ── 1. Authenticated rep can read active entity ──────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.entities WHERE name = 'NG Spr'$$,
  'rep can read active entity'
);

-- ── 2. Authenticated rep can see inactive entity (soft-delete visible) ──────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.entities WHERE name = 'Test Inactive'$$,
  'rep can still read soft-deleted entity'
);

-- ── 3. Authenticated rep cannot insert entity ───────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.entities (id, name) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Bad Entity')$$,
  '42501',
  NULL,
  'rep cannot insert entity'
);

-- ── 4. Authenticated rep cannot update entity ───────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.entities SET name = 'Hacked' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT name FROM public.entities WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'NG Spr',
  'rep cannot update entity (silently blocked)'
);

-- ── 5. Authenticated rep cannot delete entity ───────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.entities WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT isnt_empty(
  $$SELECT id FROM public.entities WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'rep cannot delete entity (silently blocked)'
);

-- ── 6. Admin can insert entity ──────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.entities (id, name, base_currency, fiscal_year_start_month) VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'New Entity', 'USD', 1)$$,
  'admin can insert entity'
);

-- ── 7. Admin can update entity ──────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.entities SET name = 'Updated NG Spr' WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT name FROM public.entities WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Updated NG Spr',
  'admin can update entity'
);

-- ── 8. Audit log captures entity changes ─────────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.audit_log WHERE table_name = 'entities' AND row_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  '>=',
  1,
  'audit_log captured at least one entity change for row'
);

-- ── 9. Branding columns exist and are nullable ───────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT col_is_null(
  'public', 'entities', 'display_name',
  'entities.display_name exists and defaults to null'
);
SELECT col_is_null(
  'public', 'entities', 'logo_url',
  'entities.logo_url exists and defaults to null'
);
SELECT col_is_null(
  'public', 'entities', 'email_footer',
  'entities.email_footer exists and defaults to null'
);

-- ── 10. Admin can set branding columns ───────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.entities
SET display_name = 'Nodwin Gaming',
    logo_url     = 'https://example.com/logo.png',
    email_footer = 'Nodwin Gaming — sent via Nodwin CRM'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

SELECT is(
  (SELECT display_name FROM public.entities WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Nodwin Gaming',
  'admin can set display_name'
);
SELECT is(
  (SELECT logo_url FROM public.entities WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'https://example.com/logo.png',
  'admin can set logo_url'
);
SELECT is(
  (SELECT email_footer FROM public.entities WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Nodwin Gaming — sent via Nodwin CRM',
  'admin can set email_footer'
);

-- ── 11. Non-admin cannot set branding columns ────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.entities
SET display_name = 'Hacked'
WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SELECT is(
  (SELECT display_name FROM public.entities WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Nodwin Gaming',
  'rep cannot change branding columns (silently blocked)'
);

-- ── 12. Rep can read branding columns ────────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is(
  (SELECT logo_url FROM public.entities WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'https://example.com/logo.png',
  'rep can read entity branding columns'
);

SELECT * FROM finish();

ROLLBACK;
