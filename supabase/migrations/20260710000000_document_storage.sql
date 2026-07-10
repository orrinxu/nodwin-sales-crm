-- supabase/migrations/20260710000000_document_storage.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-653 Phase 1: server-side document storage.
--
-- Moves RFP/proposal/brand files from Drive-reference-only to bytes stored on
-- the VPS (self-hosted Supabase Storage, local file backend). Adds:
--   • storage_path / size_bytes columns and makes the Drive refs OPTIONAL,
--   • brand-oriented document categories,
--   • a private `documents` Storage bucket + RLS that delegates to the
--     documents-row visibility (so confidential-tier masking is inherited),
--   • relaxed UPDATE/DELETE so the uploader (not only an admin) can manage a
--     file — e.g. delete a superseded proposal — while KEEPING the confidential
--     fence on the admin branch.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Brand-oriented categories on document_category
--    (ADD VALUE is transaction-safe on PG12+ as long as the new value is not
--     used in the same transaction — it isn't; the column default stays 'other'.)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TYPE public.document_category ADD VALUE IF NOT EXISTS 'brand_guidelines';
ALTER TYPE public.document_category ADD VALUE IF NOT EXISTS 'logo_assets';
ALTER TYPE public.document_category ADD VALUE IF NOT EXISTS 'rate_card';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Schema: optional Drive refs + storage columns
-- ═══════════════════════════════════════════════════════════════════════════════

-- Drive refs are no longer mandatory — a document can now originate from a
-- direct upload (bytes in Storage) with no Drive provenance at all.
ALTER TABLE public.documents ALTER COLUMN drive_file_id   DROP NOT NULL;
ALTER TABLE public.documents ALTER COLUMN drive_folder_id DROP NOT NULL;

-- Path of the file inside the `documents` Storage bucket, and its size.
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS size_bytes   bigint;

-- Each storage object maps to exactly one document row (the Storage RLS below
-- keys off this).
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_storage_path
  ON public.documents(storage_path)
  WHERE storage_path IS NOT NULL;

-- A document must have a source: either a Drive reference or a stored file.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_source_check'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_source_check
      CHECK (drive_file_id IS NOT NULL OR storage_path IS NOT NULL);
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Relaxed UPDATE / DELETE — uploader can manage their file; admin branch
--    keeps the confidential fence (mirrors documents_select_scoped).
-- ═══════════════════════════════════════════════════════════════════════════════

-- UPDATE: uploader, or an admin on a non-confidential deal. (Enables editing a
-- file's category after upload; the confidential exclusion matches the SELECT
-- masking so an admin can never mutate a Confidential deal's file.)
DROP POLICY IF EXISTS "documents_update_author_or_admin" ON public.documents;
CREATE POLICY "documents_update_author_or_admin"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.documents.opportunity_id))
  );

-- DELETE: previously admin-only. Now the uploader can delete their own file
-- (e.g. a superseded proposal), and an admin can delete on non-confidential
-- deals only.
DROP POLICY IF EXISTS "documents_delete_admin" ON public.documents;
DROP POLICY IF EXISTS "documents_delete_uploader_or_admin" ON public.documents;
CREATE POLICY "documents_delete_uploader_or_admin"
  ON public.documents
  FOR DELETE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR (public.current_user_role() = 'admin'
        AND NOT public.opportunity_is_confidential(public.documents.opportunity_id))
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Private `documents` Storage bucket
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Storage RLS — delegate to the documents row's own visibility.
--    A storage object is reachable by an authenticated user iff a documents row
--    references its path AND that row is visible to the user under
--    documents_select_scoped. Because that subquery runs as the authenticated
--    role, documents RLS applies inside it, so ALL of the tier/entity rules —
--    including the Confidential-tier admin masking — are inherited here for free
--    and cannot drift. (Bytes are served via server-generated signed URLs; these
--    policies are the defense-in-depth backstop for the authenticated role.)
-- ═══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "documents_objects_select" ON storage.objects;
CREATE POLICY "documents_objects_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.storage_path = storage.objects.name
    )
  );

DROP POLICY IF EXISTS "documents_objects_insert" ON storage.objects;
CREATE POLICY "documents_objects_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.storage_path = storage.objects.name
    )
  );

DROP POLICY IF EXISTS "documents_objects_delete" ON storage.objects;
CREATE POLICY "documents_objects_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'documents'
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.storage_path = storage.objects.name
    )
  );
