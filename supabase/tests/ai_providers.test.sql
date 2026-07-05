-- supabase/tests/ai_providers.test.sql
-- pgTAP for public.ai_providers RLS (ORR-635): provider API keys are admin-only.
-- HIGH-RISK FILE -- see AGENTS.md §6.

BEGIN;

SELECT plan(4);

INSERT INTO auth.users (id, email) VALUES
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com'),
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin', 'admin',     NULL),
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   'Rep',   'sales_rep', NULL)
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

-- Seed a provider with a secret key as service role.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
UPDATE public.ai_providers SET enabled = true, base_url = 'http://llama:8080/v1', model = 'qwen', api_key = 'secret-provider-key'
WHERE provider = 'openai_compatible';

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty($$ SELECT provider FROM public.ai_providers $$, 'admin can read ai_providers');

SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty($$ SELECT provider FROM public.ai_providers $$,
  'non-admin cannot read ai_providers (API keys never leak to non-admins)');
SELECT is_empty(
  $$ UPDATE public.ai_providers SET api_key='sneaky' WHERE provider='claude' RETURNING provider $$,
  'non-admin update affects no rows (RLS blocks it)');

SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$ UPDATE public.ai_providers SET priority = 5 WHERE provider = 'claude' $$,
  'admin can update ai_providers');

SELECT * FROM finish();
ROLLBACK;
