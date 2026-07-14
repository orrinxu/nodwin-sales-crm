import { describe, it, expect, vi, afterEach } from "vitest"
import { createAnthropicAdapter } from "./anthropic"
import { createGeminiAdapter } from "./gemini"
import { createDeepseekAdapter } from "./deepseek"
import { createMoonshotAdapter } from "./moonshot"
import { createOllamaAdapter } from "./ollama"
import { createOpenAICompatibleAdapter } from "./openai-compatible"

// ORR-686 — assert each adapter maps AdapterCallOptions (images + json) into the
// provider-specific request body, and that omitting options leaves the body clean.

const IMG = { mimeType: "image/png", dataBase64: "aGVsbG8=" }

/** Mock fetch, run fn, return the parsed request body of the single call. */
async function captureBody(json: unknown, fn: () => Promise<unknown>): Promise<Record<string, unknown>> {
  const fetchMock = vi.fn(
    async (_input: unknown, init?: RequestInit) => {
      void init
      return { ok: true, json: async () => json, text: async () => "" }
    },
  )
  vi.stubGlobal("fetch", fetchMock)
  await fn()
  const init = fetchMock.mock.calls[0][1]
  return JSON.parse(init!.body as string)
}

afterEach(() => vi.unstubAllGlobals())

const OPENAI_RES = { choices: [{ message: { content: "{}" } }], usage: {} }

describe("Anthropic adapter — vision", () => {
  it("sends image + text content blocks when images are passed", async () => {
    const adapter = createAnthropicAdapter({ apiKey: "k", model: "claude-sonnet-4-6" })
    const body = await captureBody({ content: [{ text: "{}" }], usage: {} }, () =>
      adapter.call("read", undefined, { images: [IMG] }),
    )
    const content = (body.messages as { content: unknown }[])[0].content as Record<string, unknown>[]
    expect(content).toContainEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "aGVsbG8=" } })
    expect(content).toContainEqual({ type: "text", text: "read" })
  })

  it("keeps a plain string content when no images (unchanged body)", async () => {
    const adapter = createAnthropicAdapter({ apiKey: "k", model: "m" })
    const body = await captureBody({ content: [{ text: "{}" }], usage: {} }, () => adapter.call("hi"))
    expect((body.messages as { content: unknown }[])[0].content).toBe("hi")
  })
})

describe("Gemini adapter — vision + json", () => {
  it("adds an inlineData part and responseMimeType when images + json are passed", async () => {
    const adapter = createGeminiAdapter({ apiKey: "k", model: "gemini-1.5-pro" })
    const body = await captureBody({ candidates: [{ content: { parts: [{ text: "{}" }] } }], usageMetadata: {} }, () =>
      adapter.call("read", undefined, { images: [IMG], json: true }),
    )
    const parts = (body.contents as { parts: unknown[] }[])[0].parts
    expect(parts).toContainEqual({ inlineData: { mimeType: "image/png", data: "aGVsbG8=" } })
    expect(body.generationConfig).toEqual({ responseMimeType: "application/json" })
  })

  it("omits generationConfig when json is not requested", async () => {
    const adapter = createGeminiAdapter({ apiKey: "k", model: "gemini-1.5-pro" })
    const body = await captureBody({ candidates: [{ content: { parts: [{ text: "{}" }] } }], usageMetadata: {} }, () =>
      adapter.call("hi"),
    )
    expect(body.generationConfig).toBeUndefined()
  })
})

describe.each([
  ["DeepSeek", () => createDeepseekAdapter({ apiKey: "k", model: "deepseek-chat" })],
  ["Moonshot", () => createMoonshotAdapter({ apiKey: "k", model: "moonshot-v1-8k" })],
  ["OpenAI-compatible", () => createOpenAICompatibleAdapter({ apiKey: "k", baseUrl: "http://x/v1", model: "gpt-4o" })],
])("%s adapter — vision + json (OpenAI shape)", (_name, make) => {
  it("adds image_url content and response_format when images + json are passed", async () => {
    const body = await captureBody(OPENAI_RES, () => make().call("read", "sys", { images: [IMG], json: true }))
    const userMsg = (body.messages as { role: string; content: unknown }[]).find((m) => m.role === "user")!
    expect(userMsg.content).toContainEqual({ type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } })
    expect(body.response_format).toEqual({ type: "json_object" })
  })

  it("leaves content a plain string and omits response_format when no options", async () => {
    const body = await captureBody(OPENAI_RES, () => make().call("hi"))
    const userMsg = (body.messages as { role: string; content: unknown }[]).find((m) => m.role === "user")!
    expect(userMsg.content).toBe("hi")
    expect(body.response_format).toBeUndefined()
  })
})

describe("Ollama adapter — vision + json", () => {
  it("adds images array and format:json when passed", async () => {
    const adapter = createOllamaAdapter({ baseUrl: "http://x", model: "llava" })
    const body = await captureBody({ response: "{}", prompt_eval_count: 0, eval_count: 0 }, () =>
      adapter.call("read", undefined, { images: [IMG], json: true }),
    )
    expect(body.images).toEqual(["aGVsbG8="])
    expect(body.format).toBe("json")
  })

  it("omits images and format when no options (unchanged body)", async () => {
    const adapter = createOllamaAdapter({ baseUrl: "http://x", model: "llama3.2" })
    const body = await captureBody({ response: "{}", prompt_eval_count: 0, eval_count: 0 }, () => adapter.call("hi"))
    expect(body.images).toBeUndefined()
    expect(body.format).toBeUndefined()
  })
})
