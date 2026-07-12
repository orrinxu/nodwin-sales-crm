-- supabase/tests/user_public_profile.test.sql
-- pgTAP tests for get_user_public_profile() — the colleague profile accessor.
-- HIGH-RISK FILE — see AGENTS.md §6 (identity + RLS).
--
-- Verifies the accessor gives any authenticated user read of the PUBLIC profile
-- fields of ANY user (even cross-entity), while the base-table SELECT RLS stays
-- same-entity-scoped, and anon cannot call it.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(8);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

-- Two entities in different groups; entity B carries a branding display_name.
INSERT INTO public.entities (id, name, display_name)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Entity A Legal', NULL),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Trinity Legal', 'Trinity Gaming')
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  display_name = EXCLUDED.display_name;

-- Auth users first (FK to auth.users; trigger auto-creates public.users rows).
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   '{"full_name":"Sales Rep"}'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', '{"full_name":"Other Rep"}')
ON CONFLICT (id) DO NOTHING;

-- rep is in entity A; other is in entity B, with public profile fields set.
INSERT INTO public.users
  (id, email, full_name, primary_role, primary_entity_id, "position", slack_member_id, slack_team_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   'Sales Rep', 'sales_rep',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', NULL, NULL, NULL),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', 'Other Rep', 'sales_rep',
   'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Head of Sales', 'U123ABC', 'T999XYZ')
ON CONFLICT (id) DO UPDATE SET
  full_name         = EXCLUDED.full_name,
  primary_role      = EXCLUDED.primary_role,
  primary_entity_id = EXCLUDED.primary_entity_id,
  "position"        = EXCLUDED."position",
  slack_member_id   = EXCLUDED.slack_member_id,
  slack_team_id     = EXCLUDED.slack_team_id;

-- ── Act as rep (entity A) reading the cross-entity user (entity B) ────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;

-- ── 1. Accessor returns the cross-entity user's name ─────────────────────────
SELECT is(
  (SELECT full_name FROM public.get_user_public_profile('33333333-3333-3333-3333-333333333333')),
  'Other Rep',
  'accessor returns a cross-entity user''s full_name'
);

-- ── 2. Accessor returns the free-text position ───────────────────────────────
SELECT is(
  (SELECT "position" FROM public.get_user_public_profile('33333333-3333-3333-3333-333333333333')),
  'Head of Sales',
  'accessor returns the position'
);

-- ── 3. Accessor returns the Slack member ID ──────────────────────────────────
SELECT is(
  (SELECT slack_member_id FROM public.get_user_public_profile('33333333-3333-3333-3333-333333333333')),
  'U123ABC',
  'accessor returns slack_member_id'
);

-- ── 4. Accessor resolves entity_name via COALESCE(display_name, name) ────────
SELECT is(
  (SELECT entity_name FROM public.get_user_public_profile('33333333-3333-3333-3333-333333333333')),
  'Trinity Gaming',
  'accessor resolves entity display_name'
);

-- ── 5. Base-table RLS is UNCHANGED: rep cannot directly read entity-B user ────
SELECT is_empty(
  $$SELECT id FROM public.users WHERE id = '33333333-3333-3333-3333-333333333333'$$,
  'direct table read still hidden by same-entity RLS'
);

-- ── 6. …but the accessor DOES surface that cross-entity user ──────────────────
SELECT isnt_empty(
  $$SELECT id FROM public.get_user_public_profile('33333333-3333-3333-3333-333333333333')$$,
  'accessor surfaces the cross-entity user the table read hid'
);

-- ── 7. Unknown id returns zero rows (→ notFound() in the app) ─────────────────
SELECT is_empty(
  $$SELECT id FROM public.get_user_public_profile('99999999-9999-9999-9999-999999999999')$$,
  'unknown id returns no rows'
);

-- ── 8. Anon cannot execute the accessor ──────────────────────────────────────
SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.get_user_public_profile('33333333-3333-3333-3333-333333333333')$$,
  '42501',
  NULL,
  'anon cannot execute get_user_public_profile'
);

SELECT * FROM finish();

ROLLBACK;
