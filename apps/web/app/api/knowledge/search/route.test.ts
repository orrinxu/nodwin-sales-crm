import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

const mockAnswer = vi.fn()
vi.mock("@/lib/data/knowledge", () => ({
  answer: mockAnswer,
  KNOWLEDGE_MAX_MATCH_COUNT: 50,
}))

const mockRequireUser = vi.fn()
vi.mock("@/lib/security/auth", () => ({
  requireUser: mockRequireUser,
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireUser.mockResolvedValue({ id: "u1", email: "user@nodwin.com", role: "sales_rep" })
  mockAnswer.mockResolvedValue({ answer: "test answer", citations: [], embeddingModel: "test-model" })
})

describe("POST /api/knowledge/search", () => {
  it("returns 400 when query is missing", async () => {
    const { POST } = await import("./route")
    const request = new Request("https://crm.nodwin.com/api/knowledge/search", {
      method: "POST",
      body: JSON.stringify({}),
    })
    const response = await POST(request as unknown as import("next/server").NextRequest)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.error).toContain("Missing 'query'")
  })

  it("passes matchCount capped at KNOWLEDGE_MAX_MATCH_COUNT", async () => {
    const { POST } = await import("./route")
    const request = new Request("https://crm.nodwin.com/api/knowledge/search", {
      method: "POST",
      body: JSON.stringify({ query: "test", matchCount: 999999 }),
    })
    const response = await POST(request as unknown as import("next/server").NextRequest)
    expect(response.status).toBe(200)
    expect(mockAnswer).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ matchCount: 50 }),
    )
  })

  it("clamps negative matchCount to 0", async () => {
    const { POST } = await import("./route")
    const request = new Request("https://crm.nodwin.com/api/knowledge/search", {
      method: "POST",
      body: JSON.stringify({ query: "test", matchCount: -10 }),
    })
    const response = await POST(request as unknown as import("next/server").NextRequest)
    expect(response.status).toBe(200)
    expect(mockAnswer).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ matchCount: 0 }),
    )
  })

  it("passes undefined matchCount when not a number", async () => {
    const { POST } = await import("./route")
    const request = new Request("https://crm.nodwin.com/api/knowledge/search", {
      method: "POST",
      body: JSON.stringify({ query: "test", matchCount: "not-a-number" }),
    })
    const response = await POST(request as unknown as import("next/server").NextRequest)
    expect(response.status).toBe(200)
    expect(mockAnswer).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ matchCount: undefined }),
    )
  })
})
