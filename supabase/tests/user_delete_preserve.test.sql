-- supabase/tests/user_delete_preserve.test.sql
-- pgTAP for audit SCHEMA-1: deleting a user must NOT destroy the documents they
-- uploaded — the FK is now ON DELETE SET NULL, not CASCADE.
-- HIGH-RISK FILE -- see AGENTS.md §6.

BEGIN;

SELECT plan(3);

INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner@nodwin.com'),
  ('99999999-9999-9999-9999-999999999999', 'leaver@nodwin.com')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.users (id, email, full_name, primary_role, primary_entity_id) VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner@nodwin.com',  'Owner',  'sales_rep', NULL),
  ('99999999-9999-9999-9999-999999999999', 'leaver@nodwin.com', 'Leaver', 'sales_rep', NULL)
ON CONFLICT (id) DO NOTHING;

SELECT tests.as_service_role();
SET LOCAL ROLE postgres;
INSERT INTO public.accounts (id, name, email_domains, account_owner_user_id, created_by)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', ARRAY['a.com'], '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111');
-- A document uploaded by the LEAVER (who owns nothing else).
INSERT INTO public.documents (id, account_id, drive_file_id, drive_folder_id, name, mime_type, category, uploaded_by)
VALUES ('d0000000-0000-0000-0000-0000000000d1', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'drive-x', 'f', 'Deck.pdf', 'application/pdf', 'proposal', '99999999-9999-9999-9999-999999999999');

-- Offboard the leaver.
DELETE FROM public.users WHERE id = '99999999-9999-9999-9999-999999999999';

SELECT isnt_empty(
  $$ SELECT id FROM public.documents WHERE id = 'd0000000-0000-0000-0000-0000000000d1' $$,
  'SCHEMA-1: the uploaded document survives deletion of its uploader');

SELECT is(
  (SELECT uploaded_by FROM public.documents WHERE id = 'd0000000-0000-0000-0000-0000000000d1'),
  NULL,
  'SCHEMA-1: uploaded_by is nulled (SET NULL), not cascaded');

SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.users WHERE id = '99999999-9999-9999-9999-999999999999'),
  'the user was actually deleted');

SELECT * FROM finish();
ROLLBACK;
