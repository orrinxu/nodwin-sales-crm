-- supabase/migrations/20260507000000_documents.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-308 / T-027: documents table.
--
-- Stores Google Drive file IDs and metadata, not file contents.
-- Drive files themselves get permissions managed via the Google API in Phase 5
-- — this table is just metadata.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Enum: document_category
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'document_category'
  ) THEN
    CREATE TYPE public.document_category AS ENUM (
      'rfp',
      'budget',
      'proposal',
      'contract',
      'po',
      'invoice',
      'presentation',
      'other'
    );
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Table: documents
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.documents (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id    uuid REFERENCES public.opportunities(id) ON DELETE SET NULL,
  account_id        uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  drive_file_id     text NOT NULL,
  drive_folder_id   text NOT NULL,
  name              text NOT NULL,
  mime_type         text NOT NULL,
  category          public.document_category NOT NULL DEFAULT 'other',
  uploaded_by       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  uploaded_at       timestamptz NOT NULL DEFAULT now(),
  link_url          text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_by        uuid,
  updated_by        uuid
);

-- At least one of opportunity_id or account_id must be set.
ALTER TABLE public.documents
  ADD CONSTRAINT documents_linked_check
  CHECK (opportunity_id IS NOT NULL OR account_id IS NOT NULL);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Indexes
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_documents_opportunity_id
  ON public.documents(opportunity_id)
  WHERE opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_account_id
  ON public.documents(account_id)
  WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by
  ON public.documents(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_documents_category
  ON public.documents(category);

CREATE INDEX IF NOT EXISTS idx_documents_drive_file_id
  ON public.documents(drive_file_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Audit fields trigger
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_document_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.created_by := OLD.created_by;
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_audit_fields_trigger ON public.documents;
CREATE TRIGGER document_audit_fields_trigger
  BEFORE INSERT OR UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.set_document_audit_fields();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Audit log
-- ═══════════════════════════════════════════════════════════════════════════════

SELECT audit.attach_trigger('public.documents');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. RLS
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- SELECT: read if user uploaded the doc, has visibility on the linked
-- opportunity, owns/created the linked account, or is admin.
DROP POLICY IF EXISTS "documents_select_scoped" ON public.documents;
DROP POLICY IF EXISTS "documents_select_all_authenticated" ON public.documents;
CREATE POLICY "documents_select_scoped"
  ON public.documents
  FOR SELECT
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.documents.opportunity_id
        AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = public.documents.account_id
        AND (account_owner_user_id = auth.uid() OR created_by = auth.uid())
    )
    OR public.current_user_role() = 'admin'
  );

-- INSERT: authenticated users can insert documents they upload.
-- Admin can insert any.
DROP POLICY IF EXISTS "documents_insert_authenticated" ON public.documents;
CREATE POLICY "documents_insert_authenticated"
  ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    OR public.current_user_role() = 'admin'
  );

-- UPDATE: uploaded_by or admin.
DROP POLICY IF EXISTS "documents_update_author_or_admin" ON public.documents;
CREATE POLICY "documents_update_author_or_admin"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR public.current_user_role() = 'admin'
  );

-- DELETE: admin only.
DROP POLICY IF EXISTS "documents_delete_admin" ON public.documents;
CREATE POLICY "documents_delete_admin"
  ON public.documents
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
