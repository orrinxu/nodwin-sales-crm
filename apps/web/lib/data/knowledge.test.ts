import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const rpc = vi.fn()
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ rpc }),
}))

import { search, KNOWLEDGE_MAX_MATCH_COUNT } from "./knowledge"
import type { Embedder } from "@/lib/ai/embeddings"

const fakeEmbedder: Embedder = {
  embed: async (texts: string[]) => ({ vectors: texts.map(() => [0.1, 0.2, 0.3]), model: "test-model", dim: 3 }),
}

const webCtx = { user: { id: "u1", email: "u@nodwin.com", role: "sales_rep" }, source: "web" as const }

describe("knowledge.search", () => {
  beforeEach(() => vi.clearAllMocks())

  it("refuses to run as source: 'system'", async () => {
    await expect(
      // @ts-expect-error — deliberately passing an out-of-type source
      search({ ...webCtx, source: "system" }, { query: "hi" }, { embedder: fakeEmbedder }),
    ).rejects.toThrow(/cannot run as source: 'system'/)
  })

  it("returns empty without embedding for a blank query", async () => {
    const spy = vi.fn()
    const res = await search(webCtx, { query: "   " }, { embedder: { embed: spy } })
    expect(res.chunks).toEqual([])
    expect(spy).not.toHaveBeenCalled()
  })

  it("embeds the query and calls the RPC with the vector string + model + defaults", async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await search(webCtx, { query: "pricing for acme" }, { embedder: fakeEmbedder })

    expect(rpc).toHaveBeenCalledWith("search_document_chunks", {
      _query: "[0.1,0.2,0.3]",
      _model: "test-model",
      _match_count: 8,
      _min_similarity: 0.25,
    })
  })

  it("maps RPC rows to provenance-bearing chunks", async () => {
    rpc.mockResolvedValue({
      data: [
        {
          id: "c1", document_id: "d1", drive_file_id: "drive-1", page_ref: "p.2", chunk_index: 0,
          opportunity_id: "opp1", account_id: null, visibility_tier: "restricted",
          category: "proposal", content: "…", similarity: 0.91,
        },
      ],
      error: null,
    })
    const res = await search(webCtx, { query: "q" }, { embedder: fakeEmbedder })
    expect(res.model).toBe("test-model")
    expect(res.chunks[0]).toMatchObject({
      id: "c1", driveFileId: "drive-1", pageRef: "p.2", opportunityId: "opp1",
      visibilityTier: "restricted", similarity: 0.91,
    })
  })

  it("propagates RPC errors", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } })
    await expect(search(webCtx, { query: "q" }, { embedder: fakeEmbedder })).rejects.toThrow(/Knowledge search failed: boom/)
  })

  it("caps matchCount at KNOWLEDGE_MAX_MATCH_COUNT", async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await search(webCtx, { query: "q", matchCount: 999999 }, { embedder: fakeEmbedder })

    expect(rpc).toHaveBeenCalledWith("search_document_chunks", expect.objectContaining({
      _match_count: KNOWLEDGE_MAX_MATCH_COUNT,
    }))
  })

  it("clamps negative matchCount to 0", async () => {
    rpc.mockResolvedValue({ data: [], error: null })
    await search(webCtx, { query: "q", matchCount: -5 }, { embedder: fakeEmbedder })

    expect(rpc).toHaveBeenCalledWith("search_document_chunks", expect.objectContaining({
      _match_count: 0,
    }))
  })
})
