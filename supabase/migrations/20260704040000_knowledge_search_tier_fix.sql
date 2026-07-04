-- supabase/migrations/20260704040000_knowledge_search_tier_fix.sql
-- HIGH-RISK FILE — see AGENTS.md §6.
--
-- SECURITY HOTFIX for the knowledge-search retrieval function shipped in #166
-- (migration 20260704030000). That version's filter had a
-- `visibility_tier = 'standard' OR <membership>` branch, which returned EVERY
-- Standard-tier chunk to EVERY authenticated user — cross-entity. That
-- contradicts docs/SOW.md §3.2 (Standard is a scoped, same-entity audience, NOT
-- org-open) and the document_chunks RLS (which gates Standard on membership).
--
-- This redefines search_document_chunks to gate ALL tiers on
-- opportunity_visibility membership (auth.uid()), so it is genuinely
-- membership ⊆ canonical-access — under-return only, never leak. Account-only
-- chunks (opportunity_id IS NULL) are not returned (deliberate fail-closed).
--
-- CREATE OR REPLACE keeps the same signature, so grants/callers are unaffected.

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
    -- Entitlement gates EVERY tier (including Standard). Filter same-model /
    -- same-dim, entitled rows FIRST so the distance operator only sees
    -- compatible vectors the caller may see.
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

COMMENT ON FUNCTION public.search_document_chunks(vector, text, integer, double precision) IS
  'ORR-621 cross-deal knowledge retrieval (tier-leak hotfix). Returns document_chunks ranked by cosine similarity, filtered in-query to chunks whose opportunity the caller is entitled to via opportunity_visibility (auth.uid()). All tiers gated on membership — Standard is NOT org-open. SECURITY DEFINER; entitlement cannot be spoofed via arguments.';
