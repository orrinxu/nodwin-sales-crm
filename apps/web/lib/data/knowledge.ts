import "server-only"
import { createServerClient } from "@/lib/supabase/server"
import { createEmbedder, type Embedder } from "@/lib/ai/embeddings"
import type { Database } from "@/lib/database.types"

// ORR-621 cross-deal knowledge retrieval (READ-ONLY over the ORR-620 index).
//
// Convention: takes { user, source }. The query path is a USER action — source
// is 'web' (or 'mcp' when the MCP spine exists), NEVER 'system'. Entitlement is
// enforced in the DB by search_document_chunks (SECURITY DEFINER, auth.uid()),
// so this layer just embeds the query and hands rows back with provenance.

export type KnowledgeCallSource = "web" | "mcp"

export interface KnowledgeCallContext {
  user: { id: string; email: string; role: string }
  source: KnowledgeCallSource
}

export interface KnowledgeSearchInput {
  query: string
  matchCount?: number
  minSimilarity?: number
}

export interface KnowledgeChunk {
  id: string
  documentId: string
  driveFileId: string
  pageRef: string | null
  chunkIndex: number
  opportunityId: string | null
  accountId: string | null
  visibilityTier: Database["public"]["Enums"]["visibility_tier"]
  category: Database["public"]["Enums"]["document_category"] | null
  content: string
  similarity: number
}

export interface KnowledgeSearchResult {
  chunks: KnowledgeChunk[]
  /** Model the query was embedded with (null when embeddings aren't wired). */
  model: string | null
}

export const KNOWLEDGE_DEFAULTS = {
  matchCount: 8,
  minSimilarity: 0.25,
}

/**
 * Embed the query with the SAME model as ingestion, then run the tier-filtered
 * vector search. The tier + entitlement filter lives inside the DB function —
 * this never post-filters an already-fetched set.
 *
 * `deps.embedder` is injectable for tests; production uses createEmbedder().
 */
export async function search(
  ctx: KnowledgeCallContext,
  input: KnowledgeSearchInput,
  deps: { embedder?: Embedder } = {},
): Promise<KnowledgeSearchResult> {
  if ((ctx.source as string) === "system") {
    throw new Error("knowledge.search is a user query path; it cannot run as source: 'system'.")
  }
  const query = input.query.trim()
  if (query.length === 0) return { chunks: [], model: null }

  const embedder = deps.embedder ?? createEmbedder()
  const { vectors, model } = await embedder.embed([query])
  const queryVector = vectors[0]
  if (!queryVector || queryVector.length === 0) return { chunks: [], model }

  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc("search_document_chunks", {
    _query: `[${queryVector.join(",")}]`,
    _model: model,
    _match_count: input.matchCount ?? KNOWLEDGE_DEFAULTS.matchCount,
    _min_similarity: input.minSimilarity ?? KNOWLEDGE_DEFAULTS.minSimilarity,
  })

  if (error) throw new Error(`Knowledge search failed: ${error.message}`)

  const chunks: KnowledgeChunk[] = (data ?? []).map((r) => ({
    id: r.id,
    documentId: r.document_id,
    driveFileId: r.drive_file_id,
    pageRef: r.page_ref,
    chunkIndex: r.chunk_index,
    opportunityId: r.opportunity_id,
    accountId: r.account_id,
    visibilityTier: r.visibility_tier,
    category: r.category,
    content: r.content,
    similarity: r.similarity,
  }))

  return { chunks, model }
}
