-- supabase/tests/documents.test.sql
-- pgTAP tests for public.documents table, RLS policies, and triggers.
-- HIGH-RISK FILE -- see AGENTS.md §6.
--
-- Run with: supabase test db

BEGIN;

SELECT plan(19);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

-- Create auth users.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',  '{"full_name":"Sales Rep"}'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', '{"full_name":"Admin User"}'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', '{"full_name":"Other Rep"}')
ON CONFLICT (id) DO NOTHING;

-- Upsert public.users rows with correct roles.
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'rep@nodwin.com',  'Sales Rep',  'sales_rep', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('22222222-2222-2222-2222-222222222222', 'admin@nodwin.com', 'Admin User', 'admin',     'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('33333333-3333-3333-3333-333333333333', 'other@nodwin.com', 'Other Rep',  'sales_rep', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
ON CONFLICT (id) DO UPDATE SET
  full_name          = EXCLUDED.full_name,
  primary_role       = EXCLUDED.primary_role,
  primary_entity_id  = EXCLUDED.primary_entity_id;

-- Insert fixture data (as service role to bypass RLS).
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;

-- Entity and business unit.
INSERT INTO public.entities (id, name)
VALUES ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Test Entity');

INSERT INTO public.business_units (id, name, entity_id, kind, manager_user_id)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Test BU', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'sales', NULL);

-- Accounts.
INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Rep Owned Account',    ARRAY['rep.com'],    '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Other Rep Owned Account', ARRAY['other.com'],  '33333333-3333-3333-3333-333333333333', '33333333-3333-3333-3333-333333333333'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'No Owner Account',       ARRAY['noowner.com'], NULL,                             '22222222-2222-2222-2222-222222222222');

-- Opportunities.
INSERT INTO public.opportunities (
  id, name, account_id, stage, owner_user_id, sales_unit_id, amount, currency, visibility_tier
) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Rep Opp',   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'qualify', '11111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 100000, 'USD', 'standard');

-- Seed opportunity_visibility so rep can see their opp.
-- The opportunity INSERT above already fires the visibility trigger, which
-- creates the ('owner') row; guard against the duplicate with ON CONFLICT.
INSERT INTO public.opportunity_visibility (opportunity_id, user_id, reason)
VALUES ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner')
ON CONFLICT (opportunity_id, user_id, reason) DO NOTHING;

-- Documents.
INSERT INTO public.documents (id, opportunity_id, account_id, drive_file_id, drive_folder_id, name, mime_type, category, uploaded_by)
VALUES
  ('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'drive-file-1', 'drive-folder-1', 'Rep Proposal.pdf', 'application/pdf', 'proposal', '11111111-1111-1111-1111-111111111111'),
  ('d0000000-0000-0000-0000-000000000002', NULL,                                  'cccccccc-cccc-cccc-cccc-cccccccccccc', 'drive-file-2', 'drive-folder-2', 'Other Contract.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'contract', '33333333-3333-3333-3333-333333333333'),
  ('d0000000-0000-0000-0000-000000000003', NULL,                                  'dddddddd-dddd-dddd-dddd-dddddddddddd', 'drive-file-3', 'drive-folder-3', 'Admin RFP.pdf', 'application/pdf', 'rfp', '22222222-2222-2222-2222-222222222222');

-- ── 1. Rep can see their own uploaded document ────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.documents WHERE name = 'Rep Proposal.pdf'$$,
  'rep can see own uploaded document'
);

-- ── 2. Rep can see document linked to visible opportunity ─────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.documents WHERE drive_file_id = 'drive-file-1'$$,
  'rep can see document linked to visible opportunity'
);

-- ── 3. Rep can see document linked to account they own/created ────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.documents WHERE drive_file_id = 'drive-file-1'$$,
  'rep can see document linked to owned account'
);

-- ── 4. Rep cannot see document linked to other rep's account ──────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.documents WHERE drive_file_id = 'drive-file-2'$$,
  'rep cannot see document linked to other rep account'
);

-- ── 5. Rep cannot see admin-uploaded doc on unowned account ───────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.documents WHERE drive_file_id = 'drive-file-3'$$,
  'rep cannot see doc on account they neither own nor created'
);

-- ── 5a. Rep cannot see admin-uploaded doc on account owned by other ───────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.documents WHERE name = 'Other Contract.docx'$$,
  'rep cannot see document on other-owned-account'
);

-- ── 6. Admin can see all documents ────────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT isnt_empty(
  $$SELECT id FROM public.documents WHERE drive_file_id = 'drive-file-1'$$,
  'admin can see rep-uploaded document'
);
SELECT isnt_empty(
  $$SELECT id FROM public.documents WHERE drive_file_id = 'drive-file-2'$$,
  'admin can see other rep-uploaded document'
);
SELECT isnt_empty(
  $$SELECT id FROM public.documents WHERE drive_file_id = 'drive-file-3'$$,
  'admin can see own uploaded document'
);

-- ── 7. Authenticated user can insert document as themselves ───────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.documents (id, opportunity_id, drive_file_id, drive_folder_id, name, mime_type, category, uploaded_by)
    VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', 'drive-new', 'folder-new', 'New Doc.pdf', 'application/pdf', 'proposal', '11111111-1111-1111-1111-111111111111')$$,
  'rep can insert document as themselves'
);

-- ── 8. User cannot insert document as another user ────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$INSERT INTO public.documents (id, account_id, drive_file_id, drive_folder_id, name, mime_type, category, uploaded_by)
    VALUES (gen_random_uuid(), 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'drive-spoof', 'folder-spoof', 'Spoofed.pdf', 'application/pdf', 'other', '33333333-3333-3333-3333-333333333333')$$,
  '42501',
  NULL,
  'rep cannot insert document as another user'
);

-- ── 8a. Admin can insert document as any user ─────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$INSERT INTO public.documents (id, account_id, drive_file_id, drive_folder_id, name, mime_type, category, uploaded_by)
    VALUES (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'drive-admin', 'folder-admin', 'Admin Upload.pdf', 'application/pdf', 'contract', '11111111-1111-1111-1111-111111111111')$$,
  'admin can insert document as any user'
);

-- ── 9. User can update own document ───────────────────────────────────────────
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$UPDATE public.documents SET name = 'Updated Proposal.pdf' WHERE drive_file_id = 'drive-file-1'$$,
  'rep can update own document'
);

-- ── 10. Other user cannot update rep's document ───────────────────────────────
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT is_empty(
  $$SELECT id FROM public.documents WHERE drive_file_id = 'drive-file-1' AND name = 'Updated Proposal.pdf'$$,
  'other rep cannot see updated name (RLS blocks read)'
);

-- ── 10a. Other user cannot update rep's document ──────────────────────────────
SELECT tests.as_user('other@nodwin.com');
SET LOCAL ROLE authenticated;
-- The other rep cannot see drive-file-1, so the UPDATE matches zero rows and
-- RETURNING yields an empty set (not a single NULL row).
SELECT results_eq(
  $$UPDATE public.documents SET name = 'Hacked.pdf' WHERE drive_file_id = 'drive-file-1' RETURNING id$$,
  $$SELECT NULL::uuid WHERE false$$,
  'other rep cannot update rep doc (RLS blocks row)'
);

-- ── 11. Non-admin cannot delete ───────────────────────────────────────────────
-- The DELETE policy is admin-only (USING clause), so a non-admin's DELETE is
-- silently filtered to zero rows rather than raising 42501. Verify the row
-- survives the attempt: the rep can still see their own document afterwards.
SELECT tests.as_user('rep@nodwin.com');
SET LOCAL ROLE authenticated;
DELETE FROM public.documents WHERE drive_file_id = 'drive-file-1';
SELECT isnt_empty(
  $$SELECT id FROM public.documents WHERE drive_file_id = 'drive-file-1'$$,
  'rep cannot delete own document (silently blocked)'
);

-- ── 12. Admin can delete any document ─────────────────────────────────────────
SELECT tests.as_user('admin@nodwin.com');
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$DELETE FROM public.documents WHERE drive_file_id = 'drive-file-2'$$,
  'admin can delete other rep document'
);

-- ── 13. CHECK constraint: at least one of opportunity_id or account_id ────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
SELECT throws_ok(
  $$INSERT INTO public.documents (id, drive_file_id, drive_folder_id, name, mime_type, category, uploaded_by)
    VALUES (gen_random_uuid(), 'drive-bad', 'folder-bad', 'Bad Doc.pdf', 'application/pdf', 'other', '11111111-1111-1111-1111-111111111111')$$,
  '23514',
  NULL,
  'CHECK constraint blocks doc with no opportunity_id or account_id'
);

-- ── 14. Category defaults to 'other' ──────────────────────────────────────────
SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.documents (id, account_id, drive_file_id, drive_folder_id, name, mime_type, uploaded_by)
VALUES ('d0000000-0000-0000-0000-000000000010', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'drive-default-cat', 'folder-dc', 'Default Category.pdf', 'application/pdf', '11111111-1111-1111-1111-111111111111');
SELECT results_eq(
  $$SELECT category::text FROM public.documents WHERE drive_file_id = 'drive-default-cat'$$,
  $$SELECT 'other'::text$$,
  'category defaults to other'
);

SELECT * FROM finish();
