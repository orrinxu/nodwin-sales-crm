-- supabase/tests/ai_usage.test.sql
-- pgTAP RLS tests for ai_usage table (ORR-147 / T-008a).
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Requires: public.users table (T-020), auth.users table (Supabase built-in)
-- All changes are rolled back; nothing persists after the test run.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(18);

-- ── Helper: create test users ─────────────────────────────────────────────────
-- Create auth.users entries (Supabase built-in) and corresponding public.users.
-- We use tests.as_service_role() to bypass RLS during test setup.

SELECT tests.as_service_role();

-- Insert into auth.users if not already present
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'rep@nodwin.com', '{}'),
  ('00000000-0000-0000-0000-000000000002', 'manager@nodwin.com', '{}'),
  ('00000000-0000-0000-0000-000000000003', 'admin@nodwin.com', '{}'),
  ('00000000-0000-0000-0000-000000000004', 'other_rep@nodwin.com', '{}')
ON CONFLICT (id) DO NOTHING;

-- Insert into public.users
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id, primary_business_unit_id)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'rep@nodwin.com', 'Test Rep', 'sales_rep', NULL, NULL),
  ('00000000-0000-0000-0000-000000000002', 'manager@nodwin.com', 'Test Manager', 'sales_manager', NULL, NULL),
  ('00000000-0000-0000-0000-000000000003', 'admin@nodwin.com', 'Test Admin', 'admin', NULL, NULL),
  ('00000000-0000-0000-0000-000000000004', 'other_rep@nodwin.com', 'Other Rep', 'sales_rep', NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Test 1-2: Table and view exist ────────────────────────────────────────────

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_usage'
  ),
  'public.ai_usage table exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'ai_usage_daily_rollup'
  ),
  'public.ai_usage_daily_rollup view exists'
);

-- ── Test 3-4: RLS is enabled ─────────────────────────────────────────────────

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'ai_usage'),
  'RLS is enabled on ai_usage'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'ai_daily_caps'),
  'RLS is enabled on ai_daily_caps'
);

-- ── Test 5-7: Insert as own user ──────────────────────────────────────────────

SELECT tests.as_user('rep@nodwin.com');

SELECT tests.assert_can_insert(
  'ai_usage',
  '(''00000000-0000-0000-0000-000000000010'',
    ''00000000-0000-0000-0000-000000000001'',
    ''claude'',
    ''claude-sonnet-4'',
    500, 200, 0.015000,
    ''search'',
    ''req-001'',
    now(),
    now(),
    ''success'')',
  'Rep can insert own AI usage row'
);

SELECT tests.assert_cannot_insert(
  'ai_usage',
  '(''00000000-0000-0000-0000-000000000011'',
    ''00000000-0000-0000-0000-000000000004'',
    ''claude'',
    ''claude-sonnet-4'',
    100, 50, 0.005000,
    ''search'',
    ''req-002'',
    now(),
    now(),
    ''success'')',
  'Rep cannot insert AI usage row for another user'
);

-- ── Test 8-10: Select own rows vs others ──────────────────────────────────────

SELECT tests.as_service_role();
INSERT INTO public.ai_usage (id, user_id, provider, model, prompt_tokens, completion_tokens, cost_usd, feature, request_id, started_at, finished_at, status)
VALUES
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', 'gemini', 'gemini-2.0-flash', 100, 50, 0.002000, 'search', 'req-010', now(), now(), 'success'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000002', 'deepseek', 'deepseek-chat', 200, 100, 0.001000, 'draft_email', 'req-011', now(), now(), 'success');

SELECT tests.as_user('rep@nodwin.com');

SELECT tests.assert_can_select(
  'ai_usage',
  'id = ''00000000-0000-0000-0000-000000000020''',
  'Rep can SELECT own AI usage row'
);

SELECT tests.assert_cannot_select(
  'ai_usage',
  'id = ''00000000-0000-0000-0000-000000000021''',
  'Rep cannot SELECT another user''s AI usage row'
);

-- ── Test 11-13: Admin can see all ─────────────────────────────────────────────

SELECT tests.as_user('admin@nodwin.com');

SELECT tests.assert_can_select(
  'ai_usage',
  'id = ''00000000-0000-0000-0000-000000000020''',
  'Admin can SELECT other user''s AI usage'
);

SELECT tests.assert_can_select(
  'ai_usage',
  'id = ''00000000-0000-0000-0000-000000000021''',
  'Admin can SELECT another different user''s AI usage'
);

SELECT tests.assert_can_insert(
  'ai_usage',
  '(''00000000-0000-0000-0000-000000000030'',
    ''00000000-0000-0000-0000-000000000004'',
    ''kimi'',
    ''moonshot-v1'',
    300, 150, 0.003000,
    ''summarise_deal'',
    ''req-020'',
    now(),
    now(),
    ''success'')',
  'Admin can insert AI usage row for any user'
);

-- ── Test 14-16: ai_daily_caps RLS ─────────────────────────────────────────────

SELECT tests.as_user('rep@nodwin.com');

SELECT tests.assert_can_select(
  'ai_daily_caps',
  'true',
  'Authenticated user can SELECT from ai_daily_caps'
);

SELECT tests.assert_cannot_insert(
  'ai_daily_caps',
  '(gen_random_uuid(), ''team'', ''00000000-0000-0000-0000-000000000001'', 30.00, 50.00, true, now(), now())',
  'Non-admin cannot INSERT into ai_daily_caps'
);

SELECT tests.as_user('admin@nodwin.com');

SELECT tests.assert_can_insert(
  'ai_daily_caps',
  '(gen_random_uuid(), ''team'', ''00000000-0000-0000-0000-000000000001'', 30.00, 50.00, true, now(), now())',
  'Admin can INSERT into ai_daily_caps'
);

-- ── Test 17-18: Helper functions exist and return correct shape ───────────────

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'get_effective_user_caps'
  ),
  'get_effective_user_caps function exists'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'check_ai_caps'
  ),
  'check_ai_caps function exists'
);

SELECT * FROM finish();

ROLLBACK;
