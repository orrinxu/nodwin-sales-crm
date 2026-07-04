-- supabase/policies/document_chunks.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- RLS policies for public.document_chunks (ORR-620 ingestion index).
-- These are also embedded in 20260704020000_document_ingestion.sql so the
-- migration is self-contained. This file exists for security-review readability.
--
-- Rules:
--   WRITES: none for authenticated. The ingestion worker writes via the
--           service_role key (bypasses RLS), so there is intentionally no
--           INSERT/UPDATE/DELETE policy — users cannot author chunks directly.
--   SELECT: mirrors documents_select_scoped (post Confidential-tier masking) —
--           readable by the uploader, users with visibility on the linked
--           opportunity, the linked account's owner/creator, or an admin; admins
--           are fenced out of Confidential rows via the chunk's own inherited
--           visibility_tier (fail-closed). Filterable by visibility_tier and
--           opportunity_id.

ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_chunks_select_scoped" ON public.document_chunks;
CREATE POLICY "document_chunks_select_scoped"
  ON public.document_chunks
  FOR SELECT
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.opportunity_visibility
      WHERE opportunity_id = public.document_chunks.opportunity_id
        AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.accounts
      WHERE id = public.document_chunks.account_id
        AND (account_owner_user_id = auth.uid() OR created_by = auth.uid())
    )
    OR (
      public.current_user_role() = 'admin'
      AND public.document_chunks.visibility_tier <> 'confidential'
    )
  );
