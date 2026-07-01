-- supabase/policies/documents.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ⚠️  PARTIALLY SUPERSEDED by migration 20260619000006 (Confidential-tier masking,
--     ORR-600 #3). The `OR current_user_role() = 'admin'` branch of
--     documents_select_scoped now excludes documents attached to Confidential
--     opportunities: `AND NOT opportunity_is_confidential(opportunity_id)`. See that
--     migration for the authoritative definition.
--
-- RLS policies for the public.documents table.
-- These are also embedded in 20260507000000_documents.sql so the migration is
-- self-contained.  This file exists for security-review readability.
--
-- Rules:
--   SELECT: read if user uploaded the doc, has opportunity visibility,
--           owns/created linked account, or is admin.
--   INSERT: authenticated users can insert docs they upload; admin can insert any.
--   UPDATE: user who uploaded, or admin.
--   DELETE: admin only.

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- ── SELECT ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "documents_select_all_authenticated" ON public.documents;
DROP POLICY IF EXISTS "documents_select_scoped" ON public.documents;
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

-- ── INSERT ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "documents_insert_authenticated" ON public.documents;
CREATE POLICY "documents_insert_authenticated"
  ON public.documents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    OR public.current_user_role() = 'admin'
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "documents_update_author_or_admin" ON public.documents;
CREATE POLICY "documents_update_author_or_admin"
  ON public.documents
  FOR UPDATE
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR public.current_user_role() = 'admin'
  );

-- ── DELETE ────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "documents_delete_admin" ON public.documents;
CREATE POLICY "documents_delete_admin"
  ON public.documents
  FOR DELETE
  TO authenticated
  USING (public.current_user_role() = 'admin');
