-- supabase/tests/confidential_tier.test.sql
-- pgTAP tests for Confidential visibility-tier admin masking (ORR-600 #3).
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Run with: supabase test db  (all changes rolled back)

BEGIN;

SELECT plan(8);

-- ── Fixtures ─────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-11111111c0f1', 'crep@nodwin.com',  '{"full_name":"Conf Rep"}'),
  ('22222222-2222-2222-2222-22222222c0f2', 'cadmin@nodwin.com', '{"full_name":"Conf Admin"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('11111111-1111-1111-1111-11111111c0f1', 'crep@nodwin.com',  'Conf Rep',   'sales_rep', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeec0fe'),
  ('22222222-2222-2222-2222-22222222c0f2', 'cadmin@nodwin.com', 'Conf Admin', 'admin',     'eeeeeeee-eeee-eeee-eeee-eeeeeeeec0fe')
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name, primary_role = EXCLUDED.primary_role;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeec0fe', 'Conf Entity');
INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbc0fb', 'Conf BU', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeec0fe', 'sales', NULL);
INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaac0fa', 'Conf Account', ARRAY['conf.com'], '11111111-1111-1111-1111-11111111c0f1', '11111111-1111-1111-1111-11111111c0f1');

-- A Confidential deal and a Standard deal, both owned by the rep.
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier)
VALUES
  ('c0000000-0000-0000-0000-0000000000c0', 'Secret M&A', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaac0fa', 'negotiate', '11111111-1111-1111-1111-11111111c0f1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbc0fb', 300000, 'USD', 'confidential'),
  ('50000000-0000-0000-0000-0000000000c1', 'Normal Deal', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaac0fa', 'qualify',  '11111111-1111-1111-1111-11111111c0f1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbc0fb', 50000, 'USD', 'standard');

-- A split on the Confidential deal.
INSERT INTO public.opportunity_splits (opportunity_id, sales_unit_id, user_id, pct)
VALUES ('c0000000-0000-0000-0000-0000000000c0', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbc0fb', '11111111-1111-1111-1111-11111111c0f1', 100);

-- A document on the Confidential deal (uploaded by the rep, not the admin).
INSERT INTO public.documents (id, opportunity_id, account_id, drive_file_id, drive_folder_id, name, mime_type, category, uploaded_by)
VALUES ('dc000000-0000-0000-0000-0000000000c0', 'c0000000-0000-0000-0000-0000000000c0', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaac0fa', 'df-c0', 'dfo-c0', 'Secret Terms.pdf', 'application/pdf', 'contract', '11111111-1111-1111-1111-11111111c0f1');

-- ── As ADMIN ─────────────────────────────────────────────────────────────────
SELECT tests.as_user('cadmin@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT is_empty(
  $$SELECT id FROM public.opportunities WHERE id = 'c0000000-0000-0000-0000-0000000000c0'$$,
  'admin cannot read the full row of a Confidential opportunity');

SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = '50000000-0000-0000-0000-0000000000c1'$$,
  'admin can still read Standard opportunities');

SELECT is_empty(
  $$SELECT opportunity_id FROM public.opportunity_splits WHERE opportunity_id = 'c0000000-0000-0000-0000-0000000000c0'$$,
  'admin cannot read splits of a Confidential opportunity');

SELECT is_empty(
  $$SELECT id FROM public.documents WHERE id = 'dc000000-0000-0000-0000-0000000000c0'$$,
  'admin cannot read documents on a Confidential opportunity');

SELECT isnt_empty(
  $$SELECT id FROM public.confidential_opportunities_metadata() WHERE id = 'c0000000-0000-0000-0000-0000000000c0'$$,
  'admin CAN see Confidential deal metadata (existence)');

SELECT is(
  (SELECT value_bucket FROM public.confidential_opportunities_metadata() WHERE id = 'c0000000-0000-0000-0000-0000000000c0'),
  '250K-1M',
  'metadata exposes a value bucket, not the raw amount');

-- ── As OWNER (rep) ───────────────────────────────────────────────────────────
SELECT tests.as_user('crep@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT isnt_empty(
  $$SELECT id FROM public.opportunities WHERE id = 'c0000000-0000-0000-0000-0000000000c0'$$,
  'the owner can still read their own Confidential opportunity');

SELECT is_empty(
  $$SELECT id FROM public.confidential_opportunities_metadata()$$,
  'the metadata function returns nothing to non-admins');

SELECT * FROM finish();
ROLLBACK;
