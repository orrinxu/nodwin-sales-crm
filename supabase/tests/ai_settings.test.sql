-- supabase/tests/ai_settings.test.sql
-- pgTAP tests for public.ai_settings RLS (ORR-634).
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- Point: the AI endpoint API keys are admin-only. A non-admin must not be able
-- to read (or write) the ai_settings row.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(4);

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin"}'),
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   '{"full_name":"Rep"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin', 'admin',     NULL),
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   'Rep',   'sales_rep', NULL)
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

-- Seed a config row as service role (bypasses RLS).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.ai_settings (id, embeddings_base_url, embeddings_model, embeddings_api_key, generation_api_key)
VALUES ('a5000000-0000-0000-0000-000000000001', 'http://llama:8080/v1', 'nomic-embed-text', 'secret-embed-key', 'secret-gen-key');

-- ── Admin can read the config ─────────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$ SELECT id FROM public.ai_settings $$,
  'admin can read ai_settings'
);

-- ── Non-admin (rep) CANNOT read the config (no key leak) ───────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$ SELECT id FROM public.ai_settings $$,
  'non-admin cannot read ai_settings (API keys never leak to non-admins)'
);

-- ── Non-admin cannot insert ───────────────────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$ INSERT INTO public.ai_settings (embeddings_model) VALUES ('sneaky') $$,
  '42501', NULL,
  'non-admin cannot insert ai_settings'
);

-- ── Admin can update ──────────────────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ UPDATE public.ai_settings SET search_enabled = false WHERE id = 'a5000000-0000-0000-0000-000000000001' $$,
  'admin can update ai_settings'
);

SELECT * FROM finish();
ROLLBACK;
