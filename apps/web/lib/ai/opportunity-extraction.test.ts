import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  extractOpportunityFromText,
  extractJsonObject,
  opportunityExtractionSchema,
  buildExtractionPrompt,
  EXTRACTION_UNCONFIGURED_MESSAGE,
  MAX_EXTRACTION_INPUT_CHARS,
  type OpportunityExtractionDeps,
} from "./opportunity-extraction"
import type { ProviderAdapter } from "./types"
import type { ProviderName } from "./providers"

type AiCallFn = NonNullable<OpportunityExtractionDeps["aiCall"]>

const fakeAdapter: ProviderAdapter = {
  call: vi.fn(async () => ({ text: "", model: "m", promptTokens: 0, completionTokens: 0 })),
}
const oneAdapter = () => new Map<ProviderName, ProviderAdapter>([["claude", fakeAdapter]])

function deps(aiCall: OpportunityExtractionDeps["aiCall"], adapters = oneAdapter): OpportunityExtractionDeps {
  return { resolveAdapters: async () => adapters(), aiCall }
}

const GOOD_JSON = JSON.stringify({
  name: { value: "Valorant India Invitational", confidence: 0.9, source: "Valorant India Invitational" },
  account: { value: "Acme Corp", confidence: 0.8, source: "from Acme Corp" },
  amount: { value: 5000000, confidence: 0.7, source: "INR 50,00,000" },
  currency: { value: "INR", confidence: 0.7, source: "INR" },
  serviceType: { value: ["Studio Production"], confidence: 0.6, source: "studio production" },
  recurring: { value: false, confidence: 0.5, source: "one-off" },
  // never-infer + unknown keys must be stripped:
  stage: { value: "negotiate", confidence: 0.9, source: "x" },
  owner: { value: "Bob", confidence: 0.9, source: "x" },
  nonsense: { value: "x", confidence: 1, source: "x" },
})

describe("extractJsonObject", () => {
  it("parses a bare JSON object", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 })
  })
  it("parses a fenced ```json block", () => {
    expect(extractJsonObject('here:\n```json\n{"a":1}\n```\nok')).toEqual({ a: 1 })
  })
  it("parses an object embedded in prose", () => {
    expect(extractJsonObject('Sure! {"a":1} done')).toEqual({ a: 1 })
  })
  it("returns undefined when nothing parses", () => {
    expect(extractJsonObject("no json here")).toBeUndefined()
  })
})

describe("opportunityExtractionSchema", () => {
  it("coerces amount to a string and confidence from a string", () => {
    const parsed = opportunityExtractionSchema.parse({
      amount: { value: 5000000, confidence: "0.8", source: "INR 50,00,000" },
    })
    expect(parsed.amount?.value).toBe("5000000")
    expect(parsed.amount?.confidence).toBe(0.8)
  })
  it("strips never-infer and unknown fields", () => {
    const parsed = opportunityExtractionSchema.parse(JSON.parse(GOOD_JSON)) as Record<string, unknown>
    expect(parsed).not.toHaveProperty("stage")
    expect(parsed).not.toHaveProperty("owner")
    expect(parsed).not.toHaveProperty("nonsense")
  })
})

describe("extractOpportunityFromText", () => {
  it("returns parsed fields on a good reply and never calls with the never-infer fields", async () => {
    const aiCall = vi.fn<AiCallFn>(async () => ({ ok: true, data: GOOD_JSON, model: "claude-sonnet-4-6" }))
    const res = await extractOpportunityFromText({ text: "RFP body", userId: "u1" }, deps(aiCall))
    expect(res.ok).toBe(true)
    expect(aiCall).toHaveBeenCalledTimes(1)
    expect(res.fields?.name?.value).toBe("Valorant India Invitational")
    expect(res.fields?.amount?.value).toBe("5000000")
    expect(res.model).toBe("claude-sonnet-4-6")
    // never-infer / unknown keys are absent
    expect(res.fields).not.toHaveProperty("stage")
    expect(res.fields).not.toHaveProperty("owner")
    // the feature tag routes to the per-feature provider (ORR-674)
    expect(aiCall.mock.calls[0][0].feature).toBe("opportunity_extraction")
  })

  it("unwraps a fenced JSON reply", async () => {
    const aiCall = vi.fn(async () => ({ ok: true, data: "```json\n" + GOOD_JSON + "\n```", model: "m" }))
    const res = await extractOpportunityFromText({ text: "doc", userId: "u1" }, deps(aiCall))
    expect(res.ok).toBe(true)
    expect(res.fields?.account?.value).toBe("Acme Corp")
  })

  it("retries once when the first reply is not parseable, then succeeds", async () => {
    const aiCall = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: "sorry, I cannot do that", model: "m" })
      .mockResolvedValueOnce({ ok: true, data: GOOD_JSON, model: "m" })
    const res = await extractOpportunityFromText({ text: "doc", userId: "u1" }, deps(aiCall))
    expect(res.ok).toBe(true)
    expect(aiCall).toHaveBeenCalledTimes(2)
    // the retry prompt carries a corrective nudge
    expect(aiCall.mock.calls[1][0].prompt).toMatch(/ONLY the JSON object/i)
  })

  it("fails after two unparseable replies", async () => {
    const aiCall = vi.fn(async () => ({ ok: true, data: "still not json", model: "m" }))
    const res = await extractOpportunityFromText({ text: "doc", userId: "u1" }, deps(aiCall))
    expect(res.ok).toBe(false)
    expect(aiCall).toHaveBeenCalledTimes(2)
    expect(res.error).toMatch(/could not be read/i)
  })

  it("returns unconfigured (and never calls the model) when no adapter is configured", async () => {
    const aiCall = vi.fn()
    const res = await extractOpportunityFromText(
      { text: "doc", userId: "u1" },
      deps(aiCall, () => new Map()),
    )
    expect(res.ok).toBe(false)
    expect(res.unconfigured).toBe(true)
    expect(res.error).toBe(EXTRACTION_UNCONFIGURED_MESSAGE)
    expect(aiCall).not.toHaveBeenCalled()
  })

  it("surfaces the budget message on a cap rejection", async () => {
    const aiCall = vi.fn(async () => ({ ok: false, reason: "service_unavailable" }))
    const res = await extractOpportunityFromText({ text: "doc", userId: "u1" }, deps(aiCall))
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/daily AI budget/i)
    expect(aiCall).toHaveBeenCalledTimes(1) // no retry on a provider/cap failure
  })

  it("rejects empty input without calling the model", async () => {
    const aiCall = vi.fn()
    const res = await extractOpportunityFromText({ text: "   ", userId: "u1" }, deps(aiCall))
    expect(res.ok).toBe(false)
    expect(aiCall).not.toHaveBeenCalled()
  })

  it("flags truncation and clips an over-long document", async () => {
    const aiCall = vi.fn<AiCallFn>(async () => ({ ok: true, data: GOOD_JSON, model: "m" }))
    const big = "x".repeat(MAX_EXTRACTION_INPUT_CHARS + 500)
    const res = await extractOpportunityFromText({ text: big, userId: "u1" }, deps(aiCall))
    expect(res.ok).toBe(true)
    expect(res.truncated).toBe(true)
    const sentPrompt = aiCall.mock.calls[0][0].prompt as string
    expect(sentPrompt).toMatch(/truncated/i)
  })
})

describe("buildExtractionPrompt", () => {
  it("lists the fields and includes the document", () => {
    const p = buildExtractionPrompt("HELLO DOC", false)
    expect(p).toMatch(/- name:/)
    expect(p).toMatch(/- amount:/)
    expect(p).toContain("HELLO DOC")
    // never-infer fields are not part of the guide
    expect(p).not.toMatch(/- stage:/)
    expect(p).not.toMatch(/- visibilityTier:/)
  })
})
