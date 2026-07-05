-- supabase/migrations/20260705030000_user_delete_preserve_records.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- Audit SCHEMA-1/2: deleting a user CASCADE-destroyed their data.
--   * SCHEMA-1 (High): documents.uploaded_by ON DELETE CASCADE — offboarding a
--     rep permanently deleted every document they uploaded AND its
--     document_chunks. No soft-delete on documents; sibling document_chunks.
--     uploaded_by is already ON DELETE SET NULL.
--   * SCHEMA-2 (Med): ai_usage.user_id / activities.user_id ON DELETE CASCADE —
--     erased the append-only AI-usage ledger and activity history needed for
--     retrospective metrics/audit.
--
-- Switch all three to ON DELETE SET NULL so the records survive user removal
-- (the FK column must become nullable). App code always writes a real user; NULL
-- only occurs after the referenced user is deleted.
--
-- Idempotent.

-- documents.uploaded_by
ALTER TABLE public.documents ALTER COLUMN uploaded_by DROP NOT NULL;
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_uploaded_by_fkey;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- ai_usage.user_id
ALTER TABLE public.ai_usage ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.ai_usage DROP CONSTRAINT IF EXISTS ai_usage_user_id_fkey;
ALTER TABLE public.ai_usage
  ADD CONSTRAINT ai_usage_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- activities.user_id
ALTER TABLE public.activities ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_user_id_fkey;
ALTER TABLE public.activities
  ADD CONSTRAINT activities_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
