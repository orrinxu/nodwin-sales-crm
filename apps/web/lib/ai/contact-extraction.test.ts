import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { extractContactFromText } from "./contact-extraction"
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
  fullName: { value: "Ada Lovelace", confidence: 0.9, source: "Ada Lovelace" },
  account: { value: "Acme Media", confidence: 0.8, source: "at Acme Media" },
  email: { value: "ada@acme.com", confidence: 0.9, source: "ada@acme.com" },
})

describe("extractContactFromText", () => {
  it("parses contact fields and tags the contact_extraction feature with JSON mode", async () => {
    const aiCall = vi.fn<AiCallFn>(async () => ({ ok: true, data: GOOD, model: "m" }))
    const res = await extractContactFromText({ text: "spoke with Ada at Acme", userId: "u1" }, deps(aiCall))
    expect(res.ok).toBe(true)
    expect(res.fields?.fullName?.value).toBe("Ada Lovelace")
    expect(res.fields?.account?.value).toBe("Acme Media")
    expect(aiCall.mock.calls[0][0].feature).toBe("contact_extraction")
    expect(aiCall.mock.calls[0][0].json).toBe(true)
  })

  it("retries once then fails on an unparseable reply", async () => {
    const aiCall = vi.fn<AiCallFn>(async () => ({ ok: true, data: "not json", model: "m" }))
    const res = await extractContactFromText({ text: "x", userId: "u1" }, deps(aiCall))
    expect(res.ok).toBe(false)
    expect(aiCall).toHaveBeenCalledTimes(2)
  })

  it("returns unconfigured when no adapter is configured", async () => {
    const aiCall = vi.fn<AiCallFn>()
    const res = await extractContactFromText({ text: "x", userId: "u1" }, deps(aiCall, noAdapter))
    expect(res.unconfigured).toBe(true)
    expect(aiCall).not.toHaveBeenCalled()
  })
})
