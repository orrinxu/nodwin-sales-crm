-- supabase/migrations/20260716010000_rag_hnsw_index.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-756 (perf audit, highest-value latency item). document_chunks.embedding was
-- an UNSIZED `vector` (20260704020000:84), so NO ivfflat/hnsw ANN index could
-- exist — search_document_chunks did an EXACT sequential scan + full sort of the
-- whole table on every RAG query, O(N_chunks). This:
--   1. Pins the embedding column to a fixed dimension (vector(768) — the
--      nomic-embed-text dimension the deployment standardises on; ratified
--      2026-07-17). A fixed dim is a hard requirement for an HNSW index.
--   2. Adds an HNSW cosine index so retrieval is approximate-NN, not a full scan.
--   3. Rewrites the RPC so the ANN `ORDER BY embedding <=> query LIMIT k` actually
--      USES the index (the old MATERIALIZED CTE pre-materialised + exact-sorted,
--      which bypasses HNSW entirely), while keeping the entitlement gate intact.
--   4. Clamps _match_count in SQL (the ORR-630 clamp lived only in TS, so a
--      non-web caller could force a huge materialise+sort): LIMIT LEAST(...,50).
--
-- MODEL FLEXIBILITY: the embedding MODEL stays runtime-configurable (Admin →
-- Knowledge / EMBEDDINGS_*). Swapping to another 768-dim model needs no
-- migration. Switching to a different DIMENSION (e.g. OpenAI 1536) needs a repeat
-- of this file with the new dim + a re-embed — cheap while the table is ~empty.
--
-- Requires pgvector >= 0.8 (hnsw.iterative_scan). Idempotent where practical.

-- ── 1. Pin the embedding dimension ───────────────────────────────────────────
-- Any legacy embedding whose dimension isn't 768 can't live in a vector(768)
-- column and can't be compared to a 768-dim query anyway — clear it so the ALTER
-- succeeds and the row is re-ingested under the pinned model. (Normally a no-op:
-- either the table is empty or already all-768.)
UPDATE public.document_chunks
   SET embedding = NULL
 WHERE embedding IS NOT NULL
   AND vector_dims(embedding) <> 768;

ALTER TABLE public.document_chunks
  ALTER COLUMN embedding TYPE vector(768) USING embedding::vector(768);

-- ── 2. HNSW cosine index ─────────────────────────────────────────────────────
-- The RPC ranks by cosine distance (<=>) → vector_cosine_ops. Defaults
-- (m=16, ef_construction=64) are fine for this corpus size.
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw
  ON public.document_chunks
  USING hnsw (embedding vector_cosine_ops);

-- ── 3. Index-using, still-entitlement-gated search ───────────────────────────
CREATE OR REPLACE FUNCTION public.search_document_chunks(
  _query          vector,
  _model          text,
  _match_count    integer DEFAULT 8,
  _min_similarity double precision DEFAULT 0.25
)
RETURNS TABLE (
  id              uuid,
  document_id     uuid,
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
-- HNSW recall tuning for a FILTERED search, applied for the function's duration
-- (a STABLE function can't run `SET LOCAL` in its body). Entitlement filtering
-- can discard most of the raw nearest neighbours, so a fixed ef_search could
-- return fewer than _match_count entitled rows. iterative_scan (pgvector 0.8)
-- keeps expanding the candidate set until the LIMIT is satisfied or the index is
-- exhausted, so the entitlement gate can't silently starve recall.
SET hnsw.ef_search = 100
SET hnsw.iterative_scan = 'relaxed_order'
STABLE
AS $$
BEGIN
  -- Dim guard: the column is pinned to 768, so a query of any other dimension
  -- matches nothing AND would error at the distance operator (the index can't
  -- compare mismatched dims). Short-circuit to empty — preserves the pre-pin
  -- "a mismatched-dimension query returns nothing, never errors" contract.
  IF _query IS NULL OR vector_dims(_query) <> 768 THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    s.id, s.document_id, s.drive_file_id, s.page_ref, s.chunk_index,
    s.opportunity_id, s.account_id, s.visibility_tier, s.category, s.content,
    s.similarity
  FROM (
    -- Inner: the ANN top-k. `ORDER BY embedding <=> query LIMIT k` on the base
    -- table is what lets the planner use the HNSW index. Entitlement gates EVERY
    -- tier (incl. Standard — NOT org-open, docs/SOW.md §3.2) and the model guard
    -- prevents cross-model comparison; both are applied as the index scan yields
    -- rows (iterative_scan backfills past them).
    SELECT
      dc.id, dc.document_id, dc.drive_file_id, dc.page_ref, dc.chunk_index,
      dc.opportunity_id, dc.account_id, dc.visibility_tier, dc.category, dc.content,
      1 - (dc.embedding <=> _query) AS similarity
    FROM public.document_chunks dc
    WHERE dc.embedding IS NOT NULL
      AND dc.embedding_model = _model
      AND EXISTS (
        SELECT 1 FROM public.opportunity_visibility ov
        WHERE ov.opportunity_id = dc.opportunity_id
          AND ov.user_id = auth.uid()
      )
    ORDER BY dc.embedding <=> _query
    LIMIT LEAST(GREATEST(_match_count, 0), 50)
  ) s
  -- Outer: drop anything below the similarity floor, and guarantee a stable
  -- distance ordering regardless of iterative_scan's relaxed order.
  WHERE s.similarity >= _min_similarity
  ORDER BY s.similarity DESC;
END;
$$;

COMMENT ON FUNCTION public.search_document_chunks(vector, text, integer, double precision) IS
  'Entitlement-gated ANN retrieval over document_chunks (ORR-756). HNSW cosine index; every tier gated on opportunity_visibility; _match_count clamped to 50. Query must be 768-dim (the pinned embedding dimension).';

REVOKE ALL ON FUNCTION public.search_document_chunks(vector, text, integer, double precision) FROM public;
GRANT EXECUTE ON FUNCTION public.search_document_chunks(vector, text, integer, double precision) TO authenticated;
