import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

vi.mock("server-only", () => ({}))

// Controllable env stand-in. vi.hoisted so the mock factory (hoisted to the top
// of the file) can reference it safely.
const { mockEnv } = vi.hoisted(() => ({ mockEnv: {} as Record<string, string | undefined> }))
vi.mock("../security/env", () => ({ env: mockEnv }))

import { createEmbedder } from "./embeddings"

describe("createEmbedder", () => {
  beforeEach(() => {
    mockEnv.EMBEDDINGS_BASE_URL = undefined
    mockEnv.EMBEDDINGS_MODEL = undefined
    mockEnv.EMBEDDINGS_API_KEY = undefined
  })
  afterEach(() => vi.unstubAllGlobals())

  it("throws a clear error when the seam is not wired", async () => {
    await expect(createEmbedder().embed(["hi"])).rejects.toThrow(/not configured/i)
  })

  it("returns [] for empty input without calling the server", async () => {
    mockEnv.EMBEDDINGS_BASE_URL = "http://llama:8080/v1"
    mockEnv.EMBEDDINGS_MODEL = "nomic-embed-text"
    const fetchSpy = vi.fn()
    vi.stubGlobal("fetch", fetchSpy)
    const res = await createEmbedder().embed([])
    expect(res.vectors).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it("POSTs to /embeddings and derives the dimension from the response", async () => {
    mockEnv.EMBEDDINGS_BASE_URL = "http://llama:8080/v1/"
    mockEnv.EMBEDDINGS_MODEL = "nomic-embed-text"
    mockEnv.EMBEDDINGS_API_KEY = "sk-test"
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model: "nomic-embed-text",
        // Deliberately out of order to test ordering by index.
        data: [
          { index: 1, embedding: [0.4, 0.5, 0.6] },
          { index: 0, embedding: [0.1, 0.2, 0.3] },
        ],
      }),
    })
    vi.stubGlobal("fetch", fetchSpy)

    const res = await createEmbedder().embed(["first", "second"])

    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe("http://llama:8080/v1/embeddings")
    expect(init.headers.Authorization).toBe("Bearer sk-test")
    expect(JSON.parse(init.body)).toEqual({ model: "nomic-embed-text", input: ["first", "second"] })

    expect(res.dim).toBe(3)
    expect(res.model).toBe("nomic-embed-text")
    // Reordered back to input order.
    expect(res.vectors).toEqual([[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]])
  })

  it("throws on a non-ok response", async () => {
    mockEnv.EMBEDDINGS_BASE_URL = "http://llama:8080/v1"
    mockEnv.EMBEDDINGS_MODEL = "nomic-embed-text"
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }))
    await expect(createEmbedder().embed(["x"])).rejects.toThrow(/Embeddings API error 500/)
  })
})
