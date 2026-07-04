-- supabase/migrations/20260704030000_knowledge_search.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- ORR-621 / feat/orr-621-knowledge-search: retrieval RPC for cross-deal search.
--
-- READ-ONLY over the ORR-620 ingestion index. Adds no columns, no RLS changes,
-- no tier-model changes — only a SECURITY DEFINER retrieval function.
--
-- SECURITY (this is the point of the ticket):
--   * The tier filter is applied INSIDE the query (WHERE), never as a post-filter
--     on an already-fetched top-K. SECURITY DEFINER runs the vector scan with
--     definer rights so it can read all chunks, but the WHERE clause enforces:
--       returnable iff the caller is entitled to the chunk's opportunity.
--   * ALL tiers (including Standard) are gated on membership. Per docs/SOW.md
--     §3.2, Standard is NOT org-open — its audience is a scoped, same-entity set
--     (owner + team + manager chain + same-entity managers + Group Sales Lead +
--     Admin), which the recompute trigger materializes into opportunity_visibility.
--   * Entitlement REUSES that canonical `opportunity_visibility` membership table
--     (the same materialized, trigger-maintained table the opportunities /
--     documents / document_chunks RLS all use) — NOT a copied access rule. Since
--     membership ⊆ canonical-access, this can only under-return, never leak.
--   * Entitlement is pinned to auth.uid() (the real caller). The function takes
--     NO user-id argument — a caller cannot ask for another user's results.
--   * Account-only chunks (opportunity_id IS NULL) are not returned by search —
--     a deliberate fail-closed under-return (they have no opportunity_visibility).
--
-- CORRECTNESS:
--   * The query must be embedded with the SAME model as the chunks. We filter
--     embedding_model = _model and embedding_dim = vector_dims(_query); the
--     MATERIALIZED CTE guarantees the dim filter runs before any `<=>`, so a
--     mixed-dimension row can never reach the operator and throw.
--   * No ANN index yet (the embedding column is unsized while the model is open,
--     per ORR-620). This is an exact sequential scan — correct, and a perf
--     follow-up tied to pinning the model.

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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH candidates AS MATERIALIZED (
    -- Filter to same-model / same-dim rows the caller is entitled to see FIRST,
    -- so the distance operator below only ever sees compatible vectors.
    SELECT dc.*
    FROM public.document_chunks dc
    WHERE dc.embedding IS NOT NULL
      AND dc.embedding_model = _model
      AND dc.embedding_dim = vector_dims(_query)
      AND EXISTS (
        SELECT 1 FROM public.opportunity_visibility ov
        WHERE ov.opportunity_id = dc.opportunity_id
          AND ov.user_id = auth.uid()
      )
  )
  SELECT
    c.id, c.document_id, c.drive_file_id, c.page_ref, c.chunk_index,
    c.opportunity_id, c.account_id, c.visibility_tier, c.category, c.content,
    1 - (c.embedding <=> _query) AS similarity
  FROM candidates c
  WHERE (1 - (c.embedding <=> _query)) >= _min_similarity
  ORDER BY c.embedding <=> _query
  LIMIT GREATEST(_match_count, 0);
$$;

-- Only authenticated users (as themselves — auth.uid() drives entitlement).
REVOKE ALL ON FUNCTION public.search_document_chunks(vector, text, integer, double precision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_document_chunks(vector, text, integer, double precision) TO authenticated;

COMMENT ON FUNCTION public.search_document_chunks(vector, text, integer, double precision) IS
  'ORR-621 cross-deal knowledge retrieval. Returns document_chunks ranked by cosine similarity, filtered in-query to tier=standard OR caller entitled via opportunity_visibility (auth.uid()). SECURITY DEFINER; entitlement cannot be spoofed via arguments.';
