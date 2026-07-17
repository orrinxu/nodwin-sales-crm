-- supabase/tests/knowledge_search.test.sql
-- pgTAP acceptance tests for public.search_document_chunks (ORR-621 entitlement
-- gate; ORR-756 HNSW ANN + fixed 768-dim + match_count clamp).
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- THE test that matters: a user not entitled to a deal gets ZERO chunks from
-- search — including Standard, which is NOT org-open (docs/SOW.md §3.2). All
-- tiers are gated on opportunity_visibility membership. ORR-756 additionally
-- pins the embedding to vector(768), so fixtures use 768-dim vectors, and adds
-- the SQL-side clamp of _match_count to 50.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(8);

-- A 768-dim unit vector ([1,0,0,…,0]) — the pinned embedding dimension. Reused
-- for every chunk and every query so similarity is uniform (1.0); the only thing
-- that varies across results is the tier/entitlement filter.
--   v768 := ('[1' || repeat(',0',767) || ']')::vector

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

-- One chunk per tier (768-dim embeddings; identical so similarity is uniform).
INSERT INTO public.document_chunks (document_id, opportunity_id, visibility_tier, drive_file_id, chunk_index, content, embedding, embedding_model, embedding_dim)
VALUES
  ('d0000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'standard',     'drive-s', 0, 'standard content',     ('[1' || repeat(',0',767) || ']')::vector, 'test-model', 768),
  ('d0000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a2', 'restricted',   'drive-r', 0, 'restricted content',   ('[1' || repeat(',0',767) || ']')::vector, 'test-model', 768),
  ('d0000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000a3', 'confidential', 'drive-c', 0, 'confidential content', ('[1' || repeat(',0',767) || ']')::vector, 'test-model', 768);

-- 60 more standard chunks in the owner's standard opp, so the entitled set is
-- well over the 50-row clamp (used by the clamp assertion below).
INSERT INTO public.document_chunks (document_id, opportunity_id, visibility_tier, drive_file_id, chunk_index, content, embedding, embedding_model, embedding_dim)
SELECT 'd0000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a1', 'standard', 'drive-s', g, 'bulk ' || g,
       ('[1' || repeat(',0',767) || ']')::vector, 'test-model', 768
FROM generate_series(1, 60) g;

-- ══ THE ACCEPTANCE TEST: a non-entitled user gets ZERO chunks of ANY tier ══
SELECT tests.as_user('outsider@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT is_empty(
  $$ SELECT id FROM public.search_document_chunks(('[1'||repeat(',0',767)||']')::vector, 'test-model', 10, 0) $$,
  'ACCEPTANCE: non-entitled user gets ZERO chunks (incl. Standard — it is not org-open)'
);

SELECT is_empty(
  $$ SELECT id FROM public.search_document_chunks(('[1'||repeat(',0',767)||']')::vector, 'test-model', 10, 0)
     WHERE visibility_tier IN ('restricted','confidential') $$,
  'non-entitled user specifically gets ZERO restricted/confidential chunks'
);

-- ══ Entitled owner sees their restricted + confidential chunks ══
SELECT tests.as_user('owner@nodwin.com');
SET LOCAL ROLE authenticated;

SELECT isnt_empty(
  $$ SELECT id FROM public.search_document_chunks(('[1'||repeat(',0',767)||']')::vector, 'test-model', 50, 0) WHERE drive_file_id = 'drive-r' $$,
  'owner (member) gets their Restricted chunk'
);
SELECT isnt_empty(
  $$ SELECT id FROM public.search_document_chunks(('[1'||repeat(',0',767)||']')::vector, 'test-model', 50, 0) WHERE drive_file_id = 'drive-c' $$,
  'owner (member) gets their Confidential chunk'
);

-- ══ ORR-756: _match_count is clamped to 50 in SQL ══
SELECT results_eq(
  $$ SELECT count(*)::int FROM public.search_document_chunks(('[1'||repeat(',0',767)||']')::vector, 'test-model', 1000, 0) $$,
  $$ VALUES (50) $$,
  'match_count is clamped to 50 in SQL (63 entitled chunks, asked for 1000)'
);

-- ══ Correctness guards ══
SELECT is_empty(
  $$ SELECT id FROM public.search_document_chunks(('[1'||repeat(',0',767)||']')::vector, 'other-model', 10, 0) $$,
  'model guard: a different embedding model returns nothing (no cross-model compare)'
);

SELECT is_empty(
  $$ SELECT id FROM public.search_document_chunks('[1,0,0,0]'::vector, 'test-model', 10, 0) $$,
  'dim guard: a mismatched-dimension query returns nothing and does not error'
);

SELECT * FROM finish();
ROLLBACK;
