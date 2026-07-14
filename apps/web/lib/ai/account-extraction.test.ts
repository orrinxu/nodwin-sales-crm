import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { extractAccountFromText } from "./account-extraction"
import type { ExtractionDeps } from "./extraction-core"
import type { ProviderAdapter } from "./types"
import type { ProviderName } from "./providers"

type AiCallFn = NonNullable<ExtractionDeps["aiCall"]>

const adapter = {} as ProviderAdapter
const oneAdapter = () => new Map<string, ProviderAdapter>([["claude", adapter]])
const noAdapter = () => new Map<string, ProviderAdapter>()

function deps(aiCall: AiCallFn, adapters: () => Map<string, ProviderAdapter> = oneAdapter): ExtractionDeps {
  return { resolveAdapters: async () => adapters() as unknown as Map<ProviderName, ProviderAdapter>, aiCall }
}

const GOOD = JSON.stringify({
  name: { value: "Acme Media", confidence: 0.9, source: "Acme Media" },
  website: { value: "acme.com", confidence: 0.8, source: "acme.com" },
})

describe("extractAccountFromText", () => {
  it("parses account fields and tags the account_extraction feature with JSON mode", async () => {
    const aiCall = vi.fn<AiCallFn>(async () => ({ ok: true, data: GOOD, model: "m" }))
    const res = await extractAccountFromText({ text: "note about Acme Media", userId: "u1" }, deps(aiCall))
    expect(res.ok).toBe(true)
    expect(res.fields?.name?.value).toBe("Acme Media")
    expect(res.fields?.website?.value).toBe("acme.com")
    expect(aiCall.mock.calls[0][0].feature).toBe("account_extraction")
    expect(aiCall.mock.calls[0][0].json).toBe(true)
  })

  it("retries once then fails on an unparseable reply", async () => {
    const aiCall = vi.fn<AiCallFn>(async () => ({ ok: true, data: "sorry, not json", model: "m" }))
    const res = await extractAccountFromText({ text: "x note", userId: "u1" }, deps(aiCall))
    expect(res.ok).toBe(false)
    expect(aiCall).toHaveBeenCalledTimes(2)
  })

  it("returns unconfigured (and never calls the model) when no adapter is configured", async () => {
    const aiCall = vi.fn<AiCallFn>()
    const res = await extractAccountFromText({ text: "x", userId: "u1" }, deps(aiCall, noAdapter))
    expect(res.unconfigured).toBe(true)
    expect(aiCall).not.toHaveBeenCalled()
  })

  it("errors (without calling the model) when neither text nor image is given", async () => {
    const aiCall = vi.fn<AiCallFn>()
    const res = await extractAccountFromText({ userId: "u1" }, deps(aiCall))
    expect(res.ok).toBe(false)
    expect(aiCall).not.toHaveBeenCalled()
  })
})
