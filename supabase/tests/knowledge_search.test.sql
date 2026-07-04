-- supabase/tests/knowledge_search.test.sql
-- pgTAP acceptance tests for public.search_document_chunks (ORR-621).
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- THE test that matters: a user not entitled to a deal gets ZERO Restricted /
-- Confidential chunks from search, while Standard chunks are org-open to all.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(8);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner@nodwin.com',    '{"full_name":"Deal Owner"}'),
  ('33333333-3333-3333-3333-333333333333', 'outsider@nodwin.com', '{"full_name":"Outsider"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner@nodwin.com',    'Deal Owner', 'sales_rep', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('33333333-3333-3333-3333-333333333333', 'outsider@nodwin.com', 'Outsider',   'sales_rep', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name) VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Test Entity');
INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Test BU', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'sales', NULL);
INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Acct', ARRAY['a.com'], '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');

-- Three opportunities, ALL owned by owner@ (so the outsider is a member of none).
-- a1 = standard, a2 = restricted, a3 = confidential.
INSERT INTO public.opportunities (id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier)
VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Std Opp', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 'USD', 'standard'),
  ('00000000-0000-0000-0000-0000000000a2', 'Res Opp', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 'USD', 'restricted'),
  ('00000000-0000-0000-0000-0000000000a3', 'Con Opp', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 'USD', 'confidential');

INSERT INTO public.documents (id, opportunity_id, account_id, drive_file_id, drive_folder_id, name, mime_type, category, uploaded_by)
VALUES
  ('d0000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', NULL, 'drive-s', 'f', 'S.pdf', 'application/pdf', 'proposal', '11111111-1111-1111-1111-111111111111'),
  ('d0000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2', NULL, 'drive-r', 'f', 'R.pdf', 'application/pdf', 'proposal', '11111111-1111-1111-1111-111111111111'),
  ('d0000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a3', NULL, 'drive-c', 'f', 'C.pdf', 'application/pdf', 'proposal', '11111111-1111-1111-1111-111111111111');

-- Chunks: identical embedding so similarity is uniform (1.0) — the ONLY thing
-- that differs across results is the tier/entitlement filter.
INSERT INTO public.document_chunks (document_id, opportunity_id, visibility_tier, drive_file_id, chunk_index, content, embedding, embedding_model, embedding_dim)
VALUES
  ('d0000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'standard',     'drive-s', 0, 'standard content',     '[1,0,0]', 'test-model', 3),
  ('d0000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2', 'restricted',   'drive-r', 0, 'restricted content',   '[1,0,0]', 'test-model', 3),
  ('d0000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a3', 'confidential', 'drive-c', 0, 'confidential content', '[1,0,0]', 'test-model', 3);

-- ══ THE ACCEPTANCE TEST: outsider gets Standard only, never Restricted/Confidential ══
SELECT tests.as_user('outsider@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT is_empty(
  $$ SELECT id FROM public.search_document_chunks('[1,0,0]'::vector, 'test-model', 10, 0)
     WHERE visibility_tier IN ('restricted','confidential') $$,
  'ACCEPTANCE: non-entitled user gets ZERO restricted/confidential chunks'
);

SELECT isnt_empty(
  $$ SELECT id FROM public.search_document_chunks('[1,0,0]'::vector, 'test-model', 10, 0)
     WHERE drive_file_id = 'drive-s' $$,
  'non-entitled user still gets the Standard (org-open) chunk'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM public.search_document_chunks('[1,0,0]'::vector, 'test-model', 10, 0) $$,
  $$ VALUES (1) $$,
  'non-entitled user gets exactly 1 result (the Standard chunk)'
);

-- ══ Entitled owner sees all three (Standard + their two memberships) ══
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT isnt_empty(
  $$ SELECT id FROM public.search_document_chunks('[1,0,0]'::vector, 'test-model', 10, 0) WHERE drive_file_id = 'drive-r' $$,
  'owner (member) gets their Restricted chunk'
);
SELECT isnt_empty(
  $$ SELECT id FROM public.search_document_chunks('[1,0,0]'::vector, 'test-model', 10, 0) WHERE drive_file_id = 'drive-c' $$,
  'owner (member) gets their Confidential chunk'
);
SELECT results_eq(
  $$ SELECT count(*)::int FROM public.search_document_chunks('[1,0,0]'::vector, 'test-model', 10, 0) $$,
  $$ VALUES (3) $$,
  'owner gets all three chunks'
);

-- ══ Correctness guards ══
SELECT is_empty(
  $$ SELECT id FROM public.search_document_chunks('[1,0,0]'::vector, 'other-model', 10, 0) $$,
  'model guard: a different embedding model returns nothing (no cross-model compare)'
);

SELECT lives_ok(
  $$ SELECT id FROM public.search_document_chunks('[1,0,0,0]'::vector, 'test-model', 10, 0) $$,
  'dim guard: a mismatched-dimension query does not error (filtered before the operator)'
);

SELECT * FROM finish();
ROLLBACK;
