-- supabase/migrations/20260704020000_document_ingestion.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-620 / feat/orr-620-ingestion-worker: Document ingestion semantic index.
--
-- INGESTION ONLY. This lands the storage + status + RLS so a background worker
-- (source: 'system') can turn Drive-linked documents into a pgvector index.
-- Query-side retrieval / search / RAG is a SEPARATE downstream ticket — this
-- migration deliberately does NOT add an ANN index or any read-side search.
--
-- Design decisions (see PR / discovery notes):
--   * The embedding model is intentionally OPEN (hosted on llama.cpp, wired
--     later), so `embedding` is an UNSIZED `vector` column (pgvector 0.8 allows
--     variable-dimension vectors). Every chunk records `embedding_model` +
--     `embedding_dim` as provenance. The fixed-dim HNSW index needs a pinned
--     model and is therefore deferred to the retrieval ticket.
--   * `visibility_tier` is INHERITED from the parent opportunity and STORED on
--     the chunk (fail-closed 'confidential' for account-only docs, set by the
--     worker). We store the tier; the retrieval-side tier policy is downstream.
--   * NO byte copy of linked files. We store extracted chunk text + vector only;
--     `drive_file_id` is the pointer back to Drive.
--   * document_chunks is high-volume system-generated derived data, so it does
--     NOT get an audit-log trigger (unlike user-authored tables). It is fully
--     rebuildable from the source document via re-index.
--
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. pgvector extension
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS vector;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Enum: document_index_status
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_index_status') THEN
    CREATE TYPE public.document_index_status AS ENUM ('pending', 'indexed', 'failed');
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. Index-status columns on documents (the ingestion queue lives here)
-- ═══════════════════════════════════════════════════════════════════════════════
-- The worker drains documents WHERE index_status = 'pending'. Manual re-index
-- sets status back to 'pending' and stamps reindex_requested_at.

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS index_status         public.document_index_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS index_error          text,
  ADD COLUMN IF NOT EXISTS index_attempts       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS indexed_at           timestamptz,
  ADD COLUMN IF NOT EXISTS reindex_requested_at timestamptz;

-- Partial index so the worker's "next pending" scan stays cheap.
CREATE INDEX IF NOT EXISTS idx_documents_index_status_pending
  ON public.documents(index_status)
  WHERE index_status = 'pending';

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. Table: document_chunks
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.document_chunks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  -- Denormalized parent links so vector rows are directly filterable by
  -- opportunity_id (brief requirement) without joining back to documents.
  opportunity_id   uuid REFERENCES public.opportunities(id) ON DELETE CASCADE,
  account_id       uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  -- INHERITED from the parent opportunity, copied at ingest. Filterable (brief).
  visibility_tier  public.visibility_tier NOT NULL,
  -- Pointer back to Drive — we deep-link to view, we do not store the file bytes.
  drive_file_id    text NOT NULL,
  chunk_index      integer NOT NULL,
  page_ref         text,                          -- page / slide reference, when known
  content          text NOT NULL,                 -- extracted chunk text (index data)
  -- UNSIZED vector: the embedding model is open (see header). Provenance below
  -- records what produced each vector so the retrieval ticket can pin the dim.
  embedding        vector,
  embedding_model  text NOT NULL,
  embedding_dim    integer NOT NULL,
  -- Provenance
  category         public.document_category,
  uploaded_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ingested_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_by       uuid,
  updated_by       uuid,
  UNIQUE (document_id, chunk_index),
  CONSTRAINT document_chunks_dim_matches_model CHECK (embedding_dim > 0)
);

CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id
  ON public.document_chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_document_chunks_opportunity_id
  ON public.document_chunks(opportunity_id)
  WHERE opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_chunks_account_id
  ON public.document_chunks(account_id)
  WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_chunks_visibility_tier
  ON public.document_chunks(visibility_tier);

-- updated_at touch trigger (chunks are insert/delete on re-index; this is for
-- completeness / any in-place metadata correction).
CREATE OR REPLACE FUNCTION public.set_document_chunk_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_chunk_updated_at_trigger ON public.document_chunks;
CREATE TRIGGER document_chunk_updated_at_trigger
  BEFORE UPDATE ON public.document_chunks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_document_chunk_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. RLS  (mirror of supabase/policies/document_chunks.sql — kept in sync there
--          for security-review readability)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Writes: none for authenticated. The worker writes via the service_role key,
-- which bypasses RLS, so there is intentionally no INSERT/UPDATE/DELETE policy —
-- users can never author chunks directly.
--
-- Reads: mirror documents_select_scoped (post Confidential-tier masking). A chunk
-- is readable by the document uploader, users with visibility on the linked
-- opportunity, the linked account's owner/creator, or an admin — but admins are
-- fenced out of Confidential-tier rows via the chunk's own inherited tier
-- (fail-closed). Filterable by visibility_tier and opportunity_id (brief).

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
