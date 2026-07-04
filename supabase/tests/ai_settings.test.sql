-- supabase/tests/ai_settings.test.sql
-- pgTAP tests for public.ai_settings RLS policies (ORR-635).
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db
-- All changes are rolled back; nothing persists after the test run.

BEGIN;

SELECT plan(9);

-- ── Fixtures ───────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin User"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.entities (id, name, base_currency)
VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Test Entity', 'USD'),
  ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Second Entity', 'USD')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com', 'Sales Rep', 'sales_rep', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin User', 'admin', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee')
ON CONFLICT (id) DO UPDATE SET
  full_name          = EXCLUDED.full_name,
  primary_role       = EXCLUDED.primary_role,
  primary_entity_id  = EXCLUDED.primary_entity_id;

-- Seed one settings row so read tests have data.
INSERT INTO public.ai_settings (id, entity_id, default_provider, default_model)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'claude', 'claude-sonnet-4')
ON CONFLICT (entity_id) DO NOTHING;

-- ── 1. Table exists ────────────────────────────────────────────────────────────

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_settings'
  ),
  'public.ai_settings table exists'
);

-- ── 2. RLS is enabled ─────────────────────────────────────────────────────────

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'ai_settings'),
  'RLS is enabled on ai_settings'
);

-- ── 3. Non-admin authenticated can read ai_settings ────────────────────────────

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT entity_id FROM public.ai_settings WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'$$,
  'non-admin authenticated can read ai_settings'
);

-- ── 4. Anon cannot read ai_settings ────────────────────────────────────────────

SELECT tests.as_anon();
SET LOCAL ROLE anon;
SELECT is_empty(
  $$SELECT entity_id FROM public.ai_settings WHERE true$$,
  'anon cannot read ai_settings'
);

-- ── 5. Non-admin cannot insert ai_settings ─────────────────────────────────────

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.ai_settings (entity_id, default_provider, default_model)
    VALUES (gen_random_uuid(), 'gemini', 'gemini-2.0-flash')$$,
  '42501',
  NULL,
  'non-admin cannot insert ai_settings'
);

-- ── 6. Non-admin cannot update ai_settings ─────────────────────────────────────

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.ai_settings SET default_model = 'hacked' WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT is(
  (SELECT default_model FROM public.ai_settings WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'claude-sonnet-4',
  'non-admin cannot update ai_settings (silently blocked)'
);

-- ── 7. Non-admin cannot delete ai_settings ─────────────────────────────────────

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.ai_settings WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT isnt_empty(
  $$SELECT entity_id FROM public.ai_settings WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'$$,
  'non-admin cannot delete ai_settings (silently blocked)'
);

-- ── 8. Admin can insert ai_settings ────────────────────────────────────────────

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.ai_settings (entity_id, default_provider, default_model, temperature, max_tokens)
    VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'deepseek', 'deepseek-chat', 0.5, 8192)$$,
  'admin can insert ai_settings'
);

-- ── 9. Admin can update ai_settings ────────────────────────────────────────────

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
UPDATE public.ai_settings SET default_model = 'claude-sonnet-4-6' WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SELECT is(
  (SELECT default_model FROM public.ai_settings WHERE entity_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
  'claude-sonnet-4-6',
  'admin can update ai_settings'
);

SELECT * FROM finish();

ROLLBACK;
