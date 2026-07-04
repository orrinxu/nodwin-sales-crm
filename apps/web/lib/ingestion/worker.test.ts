import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

// Mock the persistence layer so this is a worker-orchestration integration test
// (fetch → extract → chunk → embed → write) without a live database.
const getDocumentForIngestion = vi.fn()
const listPendingDocuments = vi.fn()
const replaceDocumentChunks = vi.fn().mockResolvedValue(0)
const setDocumentIndexStatus = vi.fn().mockResolvedValue(undefined)

vi.mock("../data/documents", () => ({
  SYSTEM_CONTEXT: { user: { id: "sys", email: "system@nodwin", role: "system" }, source: "system" },
  getDocumentForIngestion: (...a: unknown[]) => getDocumentForIngestion(...a),
  listPendingDocuments: (...a: unknown[]) => listPendingDocuments(...a),
  replaceDocumentChunks: (...a: unknown[]) => replaceDocumentChunks(...a),
  setDocumentIndexStatus: (...a: unknown[]) => setDocumentIndexStatus(...a),
}))

import { ingestDocument, runIngestionBatch, type IngestionDeps } from "./worker"
import type { Embedder } from "../ai/embeddings"
import type { DriveClient } from "../integrations/drive/types"

function fakeDrive(text: string, mimeType = "text/plain"): DriveClient {
  return {
    fetchFile: async () => ({ bytes: new TextEncoder().encode(text), mimeType, name: "sample.txt" }),
  }
}

const fakeEmbedder: Embedder = {
  embed: async (texts: string[]) => ({
    vectors: texts.map((_, i) => [i, i + 0.5, i + 1]),
    model: "fake-embed",
    dim: 3,
  }),
}

const baseDoc = {
  id: "doc-1",
  driveFileId: "drive-1",
  mimeType: "text/plain",
  opportunityId: "opp-1",
  accountId: "acc-1",
  category: "proposal" as const,
  uploadedBy: "user-1",
  indexStatus: "pending" as const,
  indexAttempts: 0,
  opportunityTier: "standard" as const,
}

describe("ingestDocument", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    replaceDocumentChunks.mockResolvedValue(0)
    setDocumentIndexStatus.mockResolvedValue(undefined)
  })

  it("indexes a linked text file end-to-end and inherits the opportunity tier", async () => {
    getDocumentForIngestion.mockResolvedValue({ ...baseDoc })
    const deps: IngestionDeps = { drive: fakeDrive("Proposal intro. Body text here."), embedder: fakeEmbedder }

    const res = await ingestDocument("doc-1", deps)

    expect(res.status).toBe("indexed")
    const input = replaceDocumentChunks.mock.calls[0][1]
    expect(input.visibilityTier).toBe("standard") // inherited
    expect(input.embeddingModel).toBe("fake-embed")
    expect(input.embeddingDim).toBe(3)
    expect(input.chunks.length).toBeGreaterThan(0)
    expect(input.chunks[0].embedding).toEqual([0, 0.5, 1])
    expect(setDocumentIndexStatus).toHaveBeenCalledWith(
      expect.anything(),
      "doc-1",
      expect.objectContaining({ status: "indexed" }),
    )
  })

  it("fails closed to 'confidential' for account-only documents (no opportunity)", async () => {
    getDocumentForIngestion.mockResolvedValue({ ...baseDoc, opportunityId: null, opportunityTier: null })
    const deps: IngestionDeps = { drive: fakeDrive("Some account doc text."), embedder: fakeEmbedder }

    await ingestDocument("doc-1", deps)

    expect(replaceDocumentChunks.mock.calls[0][1].visibilityTier).toBe("confidential")
  })

  it("marks the document failed (and bumps attempts) when Drive fetch throws", async () => {
    getDocumentForIngestion.mockResolvedValue({ ...baseDoc, indexAttempts: 2 })
    const drive: DriveClient = { fetchFile: async () => { throw new Error("Drive not configured") } }

    const res = await ingestDocument("doc-1", { drive, embedder: fakeEmbedder })

    expect(res.status).toBe("failed")
    expect(res.error).toMatch(/not configured/i)
    expect(replaceDocumentChunks).not.toHaveBeenCalled()
    expect(setDocumentIndexStatus).toHaveBeenCalledWith(
      expect.anything(),
      "doc-1",
      expect.objectContaining({ status: "failed", incrementAttempts: true, currentAttempts: 2 }),
    )
  })

  it("marks failed with a clear message for a format needing a parser (v1 gap)", async () => {
    getDocumentForIngestion.mockResolvedValue({ ...baseDoc })
    const deps: IngestionDeps = { drive: fakeDrive("%PDF-1.7 ...", "application/pdf"), embedder: fakeEmbedder }

    const res = await ingestDocument("doc-1", deps)

    expect(res.status).toBe("failed")
    expect(res.error).toMatch(/does not support/i)
  })

  it("indexes an empty file as a complete pass with zero chunks", async () => {
    getDocumentForIngestion.mockResolvedValue({ ...baseDoc })
    const res = await ingestDocument("doc-1", { drive: fakeDrive("   "), embedder: fakeEmbedder })

    expect(res.status).toBe("indexed")
    expect(res.chunks).toBe(0)
    expect(replaceDocumentChunks.mock.calls[0][1].chunks).toEqual([])
  })

  it("skips a missing document", async () => {
    getDocumentForIngestion.mockResolvedValue(null)
    const res = await ingestDocument("gone", { drive: fakeDrive("x"), embedder: fakeEmbedder })
    expect(res.status).toBe("skipped")
  })
})

describe("runIngestionBatch", () => {
  beforeEach(() => vi.clearAllMocks())

  it("drains all pending documents", async () => {
    listPendingDocuments.mockResolvedValue([{ ...baseDoc, id: "d1" }, { ...baseDoc, id: "d2" }])
    getDocumentForIngestion.mockImplementation(async (_ctx: unknown, id: string) => ({ ...baseDoc, id }))
    replaceDocumentChunks.mockResolvedValue(1)

    const summary = await runIngestionBatch({ drive: fakeDrive("hello"), embedder: fakeEmbedder }, 10)

    expect(summary.processed).toBe(2)
    expect(summary.results.every((r) => r.status === "indexed")).toBe(true)
  })
})
