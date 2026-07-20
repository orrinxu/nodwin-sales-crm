import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  generateAnswer,
  buildSources,
  buildRagPrompt,
  RAG_SYSTEM_PROMPT,
  NO_SOURCES_ANSWER,
} from "./rag"
import type { KnowledgeChunk } from "../data/knowledge"

function chunk(over: Partial<KnowledgeChunk>): KnowledgeChunk {
  return {
    id: "c", documentId: "d", documentName: "Deck.pdf", driveFileId: "drive-x", pageRef: null, chunkIndex: 0,
    opportunityId: "opp", accountId: null, visibilityTier: "standard", category: "proposal",
    content: "text", similarity: 0.9, ...over,
  }
}

describe("RAG_SYSTEM_PROMPT (injection hardening)", () => {
  it("frames excerpts as untrusted data and forbids following their instructions", () => {
    expect(RAG_SYSTEM_PROMPT).toMatch(/untrusted/i)
    expect(RAG_SYSTEM_PROMPT).toMatch(/ignore previous instructions/i)
    expect(RAG_SYSTEM_PROMPT).toMatch(/never.*instructions|disregard/i)
    expect(RAG_SYSTEM_PROMPT).toContain(NO_SOURCES_ANSWER)
  })
})

describe("generateAnswer", () => {
  it("HARD GUARDRAIL: empty chunks → fixed no-sources answer, model NOT called", async () => {
    const complete = vi.fn()
    const res = await generateAnswer("u1", "what's the acme price?", [], { complete })
    expect(res.answer).toBe(NO_SOURCES_ANSWER)
    expect(res.grounded).toBe(false)
    expect(res.sources).toEqual([])
    expect(complete).not.toHaveBeenCalled()
  })

  it("generates a grounded answer from chunks and returns deduped sources", async () => {
    const complete = vi.fn().mockResolvedValue({ text: "The price is $1M [1].", model: "qwen" })
    const chunks = [
      chunk({ documentId: "d1", documentName: "Acme Proposal.pdf", driveFileId: null, pageRef: "p.1", similarity: 0.8 }),
      chunk({ documentId: "d1", documentName: "Acme Proposal.pdf", driveFileId: null, pageRef: "p.2", similarity: 0.95 }),
      chunk({ documentId: "d2", documentName: "Deck.pdf", driveFileId: "drive-2", similarity: 0.7 }),
    ]
    const res = await generateAnswer("u1", "price?", chunks, { complete })

    expect(res.grounded).toBe(true)
    expect(res.answer).toBe("The price is $1M [1].")
    expect(res.model).toBe("qwen")
    // one source per document, best-score first, page refs collected
    expect(res.sources).toHaveLength(2)
    expect(res.sources[0]).toMatchObject({ documentId: "d1", documentName: "Acme Proposal.pdf", pageRefs: ["p.1", "p.2"], similarity: 0.95 })
    // Storage-uploaded doc (no Drive id) still cites cleanly by name.
    expect(res.sources[0].driveFileId).toBeNull()

    // the model was handed the injection-hardened system prompt + numbered excerpts,
    // cited by document NAME (never a null drive id).
    const [systemPrompt, prompt] = complete.mock.calls[0]
    expect(systemPrompt).toBe(RAG_SYSTEM_PROMPT)
    expect(prompt).toMatch(/\[1\] source: Acme Proposal\.pdf/)
    expect(prompt).not.toMatch(/source: null/)
    expect(prompt).toMatch(/untrusted document content/i)
  })

  it("falls back to the no-sources line if the model returns empty text", async () => {
    const complete = vi.fn().mockResolvedValue({ text: "   ", model: "qwen" })
    const res = await generateAnswer("u1", "q", [chunk({})], { complete })
    expect(res.answer).toBe(NO_SOURCES_ANSWER)
  })
})

describe("buildSources", () => {
  it("collapses to one source per document, sorted by best similarity", () => {
    const sources = buildSources([
      chunk({ documentId: "a", similarity: 0.5 }),
      chunk({ documentId: "b", similarity: 0.9 }),
      chunk({ documentId: "a", similarity: 0.6 }),
    ])
    expect(sources.map((s) => s.documentId)).toEqual(["b", "a"])
    expect(sources.find((s) => s.documentId === "a")!.similarity).toBe(0.6)
  })
})

describe("buildRagPrompt", () => {
  it("numbers excerpts and delimits untrusted content", () => {
    const { prompt } = buildRagPrompt("q", [chunk({ documentName: "RFP.docx", content: "secret price", pageRef: "slide 3" })])
    expect(prompt).toMatch(/\[1\] source: RFP\.docx \(slide 3\)/)
    expect(prompt).toContain("secret price")
    expect(prompt).toContain("<<<")
  })
})
