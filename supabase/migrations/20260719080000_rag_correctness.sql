-- supabase/migrations/20260719080000_rag_correctness.sql
-- HIGH-RISK FILE — see AGENTS.md §6 (RLS + SECURITY DEFINER retrieval).
--
-- ORR-808 RAG correctness cluster. Three DB-side fixes:
--
--   (b) Real citations: search_document_chunks now also returns the parent
--       document's NAME, so a Storage-uploaded doc (drive_file_id NULL, the
--       default path since ORR-653) can be cited by name + an in-app link
--       instead of "Drive file null". Adds one output column → the function
--       must be DROPped and recreated (CREATE OR REPLACE can't change the
--       return type). Signature (arg list) is unchanged, so callers/grants are
--       identical; only the RETURNS TABLE grows by one column.
--
--   (c) Account-only documents were unreachable for everyone: the entitlement
--       gate was EXISTS(opportunity_visibility WHERE opportunity_id =
--       dc.opportunity_id), and account-only chunks carry opportunity_id NULL,
--       so the EXISTS was false for every user — the doc showed 'indexed' yet
--       contributed nothing. The gate now has a second arm: account-only chunks
--       (opportunity_id NULL, account_id NOT NULL) are entitled to whoever can
--       READ the account, reusing the vetted public.can_read_account() helper
--       (SECURITY DEFINER, auth.uid()-pinned, mirrors accounts_select_scoped).
--       Opportunity-linked chunks keep their existing opportunity_visibility
--       gate untouched — this only widens reach to the previously-dead arm.
--
--   (d) The HNSW pin migration (20260716010000) nulled any non-768 embedding but
--       left the parent document 'indexed', so it would sit permanently, silently
--       unsearchable. Defensively flip any such document back to 'pending' so the
--       ingestion worker re-embeds it under the pinned model.
--
-- Also extends the ai_feature enum with 'transcription' and 'embedding' so the
-- previously-unmetered STT + query-embedding calls (ORR-808 f) can log ai_usage.

-- ── ai_feature enum: register the newly-metered call paths (ORR-808 f) ────────
-- ADD VALUE IF NOT EXISTS is idempotent; the new labels are NOT used elsewhere in
-- this migration, so adding them in the same transaction is safe (PG 12+).
ALTER TYPE public.ai_feature ADD VALUE IF NOT EXISTS 'transcription';
ALTER TYPE public.ai_feature ADD VALUE IF NOT EXISTS 'embedding';

-- ── (d) Rescue documents left 'indexed' with a nulled embedding ───────────────
-- Any document that still shows 'indexed' but has a chunk whose embedding was
-- nulled (dimension mismatch cleared by 20260716010000) can never be retrieved
-- (the RPC requires embedding IS NOT NULL). Flip it to 'pending' + stamp a
-- reindex request so the worker re-embeds it. Normally a no-op (all-768 corpus).
UPDATE public.documents d
   SET index_status = 'pending',
       index_error = NULL,
       reindex_requested_at = now()
 WHERE d.index_status = 'indexed'
   AND EXISTS (
     SELECT 1 FROM public.document_chunks dc
     WHERE dc.document_id = d.id
       AND dc.embedding IS NULL
   );

-- ── (b)+(c) Rebuild the retrieval RPC: + document_name, + account arm ─────────
-- Return type changes (new document_name column) → DROP then CREATE. The arg
-- signature is unchanged, so the existing REVOKE/GRANT posture is re-applied
-- identically below.
DROP FUNCTION IF EXISTS public.search_document_chunks(vector, text, integer, double precision);

CREATE FUNCTION public.search_document_chunks(
  _query          vector,
  _model          text,
  _match_count    integer DEFAULT 8,
  _min_similarity double precision DEFAULT 0.25
)
RETURNS TABLE (
  id              uuid,
  document_id     uuid,
  document_name   text,
  drive_file_id   text,
  page_ref        text,
  chunk_index     integer,
  opportunity_id  uuid,
  account_id      uuid,
  visibility_tier public.visibility_tier,
  category        public.document_category,
  content         text,
  similarity      double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
-- HNSW recall tuning for a FILTERED search (see 20260716010000 for the rationale):
-- iterative_scan keeps expanding the candidate set past discarded (unentitled)
-- neighbours so the entitlement gate can't silently starve recall.
SET hnsw.ef_search = 100
SET hnsw.iterative_scan = 'relaxed_order'
STABLE
AS $$
BEGIN
  -- Dim guard: the column is pinned to 768; a query of any other dimension can't
  -- be compared by the index. Short-circuit to empty (never error).
  IF _query IS NULL OR vector_dims(_query) <> 768 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.id, s.document_id, s.document_name, s.drive_file_id, s.page_ref, s.chunk_index,
    s.opportunity_id, s.account_id, s.visibility_tier, s.category, s.content,
    s.similarity
  FROM (
    -- Inner: the ANN top-k. `ORDER BY embedding <=> query LIMIT k` on the base
    -- table lets the planner use the HNSW index. The entitlement gate now covers
    -- BOTH arms:
    --   • opportunity-linked chunks → opportunity_visibility (unchanged), and
    --   • account-only chunks (opportunity_id NULL) → can_read_account (ORR-808 c).
    -- The model guard prevents cross-model comparison. iterative_scan backfills
    -- past rows these predicates discard.
    SELECT
      dc.id, dc.document_id, d.name AS document_name, dc.drive_file_id, dc.page_ref,
      dc.chunk_index, dc.opportunity_id, dc.account_id, dc.visibility_tier, dc.category,
      dc.content,
      1 - (dc.embedding <=> _query) AS similarity
    FROM public.document_chunks dc
    JOIN public.documents d ON d.id = dc.document_id
    WHERE dc.embedding IS NOT NULL
      AND dc.embedding_model = _model
      AND (
        (
          dc.opportunity_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.opportunity_visibility ov
            WHERE ov.opportunity_id = dc.opportunity_id
              AND ov.user_id = auth.uid()
          )
        )
        OR (
          dc.opportunity_id IS NULL
          AND dc.account_id IS NOT NULL
          AND public.can_read_account(dc.account_id)
        )
      )
    ORDER BY dc.embedding <=> _query
    LIMIT LEAST(GREATEST(_match_count, 0), 50)
  ) s
  WHERE s.similarity >= _min_similarity
  ORDER BY s.similarity DESC;
END;
$$;

COMMENT ON FUNCTION public.search_document_chunks(vector, text, integer, double precision) IS
  'Entitlement-gated ANN retrieval over document_chunks (ORR-756 + ORR-808). HNSW cosine index; opportunity-linked chunks gated on opportunity_visibility, account-only chunks on can_read_account; returns the parent document name for citation; _match_count clamped to 50. Query must be 768-dim.';

REVOKE ALL ON FUNCTION public.search_document_chunks(vector, text, integer, double precision) FROM public;
GRANT EXECUTE ON FUNCTION public.search_document_chunks(vector, text, integer, double precision) TO authenticated;
