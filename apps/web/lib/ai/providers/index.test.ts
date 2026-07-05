import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createAdaptersFromEnv, createAdaptersFromChain } from "./index"
import { createAnthropicAdapter } from "./anthropic"
import { createGeminiAdapter } from "./gemini"
import { createDeepseekAdapter } from "./deepseek"
import { createMoonshotAdapter } from "./moonshot"
import { createOllamaAdapter } from "./ollama"
import { createOpenAICompatibleAdapter } from "./openai-compatible"

describe("createAdaptersFromEnv", () => {
  const originalEnv = { ...process.env }

  function clearAiEnv() {
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.GOOGLE_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    delete process.env.MOONSHOT_API_KEY
    delete process.env.OLLAMA_BASE_URL
    delete process.env.OPENAI_COMPATIBLE_BASE_URL
  }

  beforeEach(() => {
    vi.resetModules()
    clearAiEnv()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("creates adapters only for configured providers", () => {
    process.env.ANTHROPIC_API_KEY = "test-key"
    process.env.GOOGLE_API_KEY = "test-key"

    const adapters = createAdaptersFromEnv()

    expect(adapters.has("claude")).toBe(true)
    expect(adapters.has("gemini")).toBe(true)
    expect(adapters.has("deepseek")).toBe(false)
    expect(adapters.has("kimi")).toBe(false)
    expect(adapters.has("ollama_local")).toBe(false)
    expect(adapters.has("openai_compatible")).toBe(false)
  })

  it("returns empty map when no providers are configured", () => {
    const adapters = createAdaptersFromEnv()
    expect(adapters.size).toBe(0)
  })

  it("creates all adapters when all env vars are set", () => {
    clearAiEnv()
    process.env.ANTHROPIC_API_KEY = "test-key"
    process.env.GOOGLE_API_KEY = "test-key"
    process.env.DEEPSEEK_API_KEY = "test-key"
    process.env.MOONSHOT_API_KEY = "test-key"
    process.env.OLLAMA_BASE_URL = "http://localhost:11434"
    process.env.OPENAI_COMPATIBLE_BASE_URL = "http://localhost:1234/v1"

    const adapters = createAdaptersFromEnv()

    expect(adapters.has("claude")).toBe(true)
    expect(adapters.has("gemini")).toBe(true)
    expect(adapters.has("deepseek")).toBe(true)
    expect(adapters.has("kimi")).toBe(true)
    expect(adapters.has("ollama_local")).toBe(true)
    expect(adapters.has("openai_compatible")).toBe(true)
  })
})

describe("createAdaptersFromChain", () => {
  it("builds only the listed providers, preserving order (= router fallback order)", () => {
    const adapters = createAdaptersFromChain([
      { provider: "ollama_local", baseUrl: "http://h:11434", model: "q", apiKey: null },
      { provider: "claude", baseUrl: null, model: "claude-x", apiKey: "k" },
    ])
    expect([...adapters.keys()]).toEqual(["ollama_local", "claude"])
    expect(adapters.has("gemini")).toBe(false)
  })

  it("injects DB config so an adapter works with no env vars set", async () => {
    delete process.env.OPENAI_COMPATIBLE_BASE_URL
    delete process.env.OPENAI_COMPATIBLE_API_KEY
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ model: "db-model", choices: [{ message: { content: "hi" } }], usage: {} }),
        { status: 200 },
      ),
    )
    vi.stubGlobal("fetch", fetchMock)
    try {
      const adapters = createAdaptersFromChain([
        { provider: "openai_compatible", baseUrl: "http://192.168.1.9:8080/v1", model: "db-model", apiKey: "db-key" },
      ])
      const result = await adapters.get("openai_compatible")!.call("hello")
      expect(result.text).toBe("hi")
      // baseUrl + bearer key came from the chain config, not env.
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe("http://192.168.1.9:8080/v1/chat/completions")
      expect(init!.headers).toMatchObject({ Authorization: "Bearer db-key" })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("skips unknown providers without throwing", () => {
    const adapters = createAdaptersFromChain([
      // @ts-expect-error deliberately invalid provider name
      { provider: "not_a_provider", baseUrl: null, model: null, apiKey: null },
      { provider: "claude", baseUrl: null, model: null, apiKey: "k" },
    ])
    expect([...adapters.keys()]).toEqual(["claude"])
  })
})

describe("provider adapters throw when env is missing", () => {
  it("anthropic throws without ANTHROPIC_API_KEY", async () => {
    delete process.env.ANTHROPIC_API_KEY
    const adapter = createAnthropicAdapter()
    await expect(adapter.call("hello")).rejects.toThrow("ANTHROPIC_API_KEY is not configured")
  })

  it("gemini throws without GOOGLE_API_KEY", async () => {
    delete process.env.GOOGLE_API_KEY
    const adapter = createGeminiAdapter()
    await expect(adapter.call("hello")).rejects.toThrow("GOOGLE_API_KEY is not configured")
  })

  it("deepseek throws without DEEPSEEK_API_KEY", async () => {
    delete process.env.DEEPSEEK_API_KEY
    const adapter = createDeepseekAdapter()
    await expect(adapter.call("hello")).rejects.toThrow("DEEPSEEK_API_KEY is not configured")
  })

  it("moonshot throws without MOONSHOT_API_KEY", async () => {
    delete process.env.MOONSHOT_API_KEY
    const adapter = createMoonshotAdapter()
    await expect(adapter.call("hello")).rejects.toThrow("MOONSHOT_API_KEY is not configured")
  })

  it("ollama throws without OLLAMA_BASE_URL", async () => {
    delete process.env.OLLAMA_BASE_URL
    const adapter = createOllamaAdapter()
    await expect(adapter.call("hello")).rejects.toThrow("OLLAMA_BASE_URL is not configured")
  })

  it("openai-compatible throws without OPENAI_COMPATIBLE_BASE_URL", async () => {
    delete process.env.OPENAI_COMPATIBLE_BASE_URL
    const adapter = createOpenAICompatibleAdapter()
    await expect(adapter.call("hello")).rejects.toThrow("OPENAI_COMPATIBLE_BASE_URL is not configured")
  })
})
