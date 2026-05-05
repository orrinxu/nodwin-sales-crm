import { describe, it, expect, vi } from "vitest"
import { createAdaptersFromEnv } from "./index"
import { createAnthropicAdapter } from "./anthropic"
import { createGeminiAdapter } from "./gemini"
import { createDeepseekAdapter } from "./deepseek"
import { createMoonshotAdapter } from "./moonshot"
import { createOllamaAdapter } from "./ollama"

describe("createAdaptersFromEnv", () => {
  const originalEnv = { ...process.env }

  function clearAiEnv() {
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.GOOGLE_API_KEY
    delete process.env.DEEPSEEK_API_KEY
    delete process.env.MOONSHOT_API_KEY
    delete process.env.OLLAMA_BASE_URL
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

    const adapters = createAdaptersFromEnv()

    expect(adapters.has("claude")).toBe(true)
    expect(adapters.has("gemini")).toBe(true)
    expect(adapters.has("deepseek")).toBe(true)
    expect(adapters.has("kimi")).toBe(true)
    expect(adapters.has("ollama_local")).toBe(true)
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
})
