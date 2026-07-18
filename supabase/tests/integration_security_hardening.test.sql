-- supabase/tests/integration_security_hardening.test.sql
-- pgTAP: ORR-696 security hardening.
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- 1. The five integration/config tables are admin-read-only (a plain rep can't
--    SELECT them).
-- 2. audit.log_change() redacts credential columns, so a rotated api_key never
--    lands in audit_log as plaintext.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(10);

INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'admin696@nodwin.com', '{"full_name":"Admin"}'),
  ('b1111111-1111-1111-1111-111111111111', 'rep696@nodwin.com',   '{"full_name":"Rep"}')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'admin696@nodwin.com', 'Admin', 'admin'),
  ('b1111111-1111-1111-1111-111111111111', 'rep696@nodwin.com',   'Rep',   'sales_rep')
ON CONFLICT (id) DO UPDATE SET primary_role = EXCLUDED.primary_role;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name) VALUES ('e6960000-0000-0000-0000-000000000001', 'ORR696 Ent');
INSERT INTO public.integration_settings (key) VALUES ('orr696_test_key');
INSERT INTO public.drive_config (entity_id) VALUES ('e6960000-0000-0000-0000-000000000001');

-- ── RLS: a plain rep cannot read the config tables ──
SELECT tests.as_user('rep696@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty($$ SELECT 1 FROM public.integration_settings $$,
  'rep cannot read integration_settings');
SELECT is_empty($$ SELECT 1 FROM public.drive_config $$,
  'rep cannot read drive_config');
SELECT is_empty($$ SELECT 1 FROM public.slack_connections $$,
  'rep cannot read slack_connections');

-- ── RLS: an admin can ──
SELECT tests.as_user('admin696@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty($$ SELECT 1 FROM public.integration_settings WHERE key = 'orr696_test_key' $$,
  'admin can read integration_settings');
SELECT isnt_empty($$ SELECT 1 FROM public.drive_config WHERE entity_id = 'e6960000-0000-0000-0000-000000000001' $$,
  'admin can read drive_config');

-- ── Audit redaction: a rotated api_key must not be stored in plaintext ──
-- Uses a valid provider value; clears any configured row first so the INSERT
-- doesn't hit the unique(provider) constraint. (All in a rolled-back txn.)
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
DELETE FROM public.ai_providers WHERE provider = 'deepseek';
INSERT INTO public.ai_providers (provider, api_key)
VALUES ('deepseek', 'sk-PLAINTEXT-MUST-NOT-APPEAR');
SELECT is(
  (SELECT new_data ? 'api_key'
     FROM public.audit_log
    WHERE table_name = 'ai_providers' AND operation = 'INSERT'
      AND new_data->>'provider' = 'deepseek'
    ORDER BY occurred_at DESC LIMIT 1),
  false,
  'audit_log new_data omits the api_key column (no plaintext secret)');
SELECT is(
  (SELECT new_data->>'provider'
     FROM public.audit_log
    WHERE table_name = 'ai_providers' AND operation = 'INSERT'
      AND new_data->>'provider' = 'deepseek'
    ORDER BY occurred_at DESC LIMIT 1),
  'deepseek',
  'audit_log still records non-secret columns');

-- ── ORR-781: redact_secrets strips the later-added secret columns ──
-- webhook_url (slack_connections) and transcription_api_key (ai_settings) were
-- added after the redaction helper and slipped through. Test the function
-- directly so the strip list is asserted regardless of per-table constraints.
SELECT is(
  audit.redact_secrets('{"webhook_url":"https://hooks.slack.com/services/SECRET","name":"ok"}'::jsonb) ? 'webhook_url',
  false,
  'redact_secrets strips webhook_url (Slack bearer secret)');
SELECT is(
  audit.redact_secrets('{"transcription_api_key":"sk-MUST-NOT-APPEAR","provider":"openai"}'::jsonb) ? 'transcription_api_key',
  false,
  'redact_secrets strips transcription_api_key');
SELECT is(
  audit.redact_secrets('{"webhook_url":"x","display_name":"keep-me"}'::jsonb) ->> 'display_name',
  'keep-me',
  'redact_secrets keeps non-secret columns alongside stripped ones');

SELECT * FROM finish();
ROLLBACK;
