-- supabase/tests/document_chunks.test.sql
-- pgTAP tests for public.document_chunks RLS (ORR-620 ingestion index).
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- Focus: inherited visibility_tier is enforced on the chunk (fail-closed for
-- Confidential, incl. admin masking), reads mirror documents scoping, and
-- authenticated users can never author chunks (worker writes via service_role).
--
-- Run with: supabase test db

BEGIN;

SELECT plan(7);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin User"}'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', '{"full_name":"Other Rep"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',   'Sales Rep',  'sales_rep', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin User', 'admin',     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', 'Other Rep',  'sales_rep', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO UPDATE SET
  full_name         = EXCLUDED.full_name,
  primary_role      = EXCLUDED.primary_role,
  primary_entity_id = EXCLUDED.primary_entity_id;

-- Insert fixture data as service role to bypass RLS.
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

INSERT INTO public.entities (id, name)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Test Entity');

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Test BU', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'sales', NULL);

INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rep Owned Account', ARRAY['rep.com'], '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');

-- Two opportunities owned by the rep: one standard, one CONFIDENTIAL.
INSERT INTO public.opportunities (
  id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier
) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Standard Opp',     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100000, 'USD', 'standard'),
  ('00000000-0000-0000-0000-000000000002', 'Confidential Opp', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 500000, 'USD', 'confidential');

-- Owner visibility rows are created by the opportunity trigger; guard duplicates.
INSERT INTO public.opportunity_visibility (opportunity_id, user_id, reason)
VALUES
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('00000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'owner')
ON CONFLICT (opportunity_id, user_id, reason) DO NOTHING;

INSERT INTO public.documents (id, opportunity_id, account_id, drive_file_id, drive_folder_id, name, mime_type, category, uploaded_by)
VALUES
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'drive-std',  'folder-1', 'Standard.pdf',     'application/pdf', 'proposal', '11111111-1111-1111-1111-111111111111'),
  ('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'drive-conf', 'folder-2', 'Confidential.pdf', 'application/pdf', 'proposal', '11111111-1111-1111-1111-111111111111');

-- Chunks: one on the standard doc, one on the confidential doc. Tier is INHERITED
-- (copied) onto the chunk — this is exactly what the worker writes.
INSERT INTO public.document_chunks (
  id, document_id, opportunity_id, account_id, visibility_tier, drive_file_id,
  chunk_index, content, embedding, embedding_model, embedding_dim, uploaded_by
) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'standard',     'drive-std',  0, 'standard chunk text',     '[0.1,0.2,0.3]', 'test-embed', 3, '11111111-1111-1111-1111-111111111111'),
  ('c0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'confidential', 'drive-conf', 0, 'confidential chunk text', '[0.4,0.5,0.6]', 'test-embed', 3, '11111111-1111-1111-1111-111111111111');

-- ── 1. Rep (owner) can read chunk on a visible opportunity ────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.document_chunks WHERE drive_file_id = 'drive-std'$$,
  'rep can read chunk on visible standard opportunity'
);

-- ── 2. Rep (owner) can read chunk on their OWN confidential opportunity ────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.document_chunks WHERE drive_file_id = 'drive-conf'$$,
  'rep can read chunk on their own confidential opportunity (has visibility)'
);

-- ── 3. Unrelated rep cannot read either chunk ─────────────────────────────────
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.document_chunks$$,
  'unrelated rep cannot read any chunk'
);

-- ── 4. Admin can read a STANDARD-tier chunk ───────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.document_chunks WHERE drive_file_id = 'drive-std'$$,
  'admin can read standard-tier chunk'
);

-- ── 5. Admin is FENCED OUT of CONFIDENTIAL-tier chunk (tier inheritance) ──────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.document_chunks WHERE drive_file_id = 'drive-conf'$$,
  'admin cannot read confidential-tier chunk (inherited tier fails closed)'
);

-- ── 6. Authenticated user cannot INSERT a chunk (no write policy) ─────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.document_chunks (document_id, opportunity_id, account_id, visibility_tier, drive_file_id, chunk_index, content, embedding, embedding_model, embedding_dim)
    VALUES ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'standard', 'drive-std', 99, 'x', '[0.1,0.2,0.3]', 'test-embed', 3)$$,
  '42501',
  NULL,
  'authenticated user cannot insert chunks (only the service_role worker can)'
);

-- ── 7. service_role (the worker) can insert a chunk ───────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT lives_ok(
  $$INSERT INTO public.document_chunks (document_id, opportunity_id, account_id, visibility_tier, drive_file_id, chunk_index, content, embedding, embedding_model, embedding_dim)
    VALUES ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'standard', 'drive-std', 1, 'worker chunk', '[0.7,0.8,0.9]', 'test-embed', 3)$$,
  'service_role worker can insert chunks'
);

SELECT * FROM finish();
ROLLBACK;
