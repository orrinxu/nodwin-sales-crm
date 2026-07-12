import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/security/auth", () => ({ requireUser: vi.fn(async () => ({ id: "u1", email: "a@x.com", role: "sales" })) }))
vi.mock("@/lib/ai/opportunity-extraction", () => ({ extractOpportunityFromText: vi.fn() }))
vi.mock("@/lib/data/opportunity-extraction-resolver", () => ({ resolveExtractedOpportunity: vi.fn() }))

import { generateOpportunityAction } from "./generate-actions"
import { extractOpportunityFromText } from "@/lib/ai/opportunity-extraction"
import { resolveExtractedOpportunity } from "@/lib/data/opportunity-extraction-resolver"

const mockExtract = vi.mocked(extractOpportunityFromText)
const mockResolve = vi.mocked(resolveExtractedOpportunity)

beforeEach(() => {
  mockExtract.mockReset()
  mockResolve.mockReset()
})

describe("generateOpportunityAction", () => {
  it("chains extraction → resolver and returns prefill/resolution/notes", async () => {
    mockExtract.mockResolvedValue({ ok: true, fields: { name: { value: "Deal", confidence: 1, source: "s" } }, truncated: false })
    mockResolve.mockResolvedValue({
      prefill: { name: "Deal" },
      resolution: { name: { status: "ok", source: "s", confidence: 1, raw: "Deal", display: "Deal" } },
      notes: [],
    })
    const res = await generateOpportunityAction({ text: "an RFP" })
    expect(res.ok).toBe(true)
    expect(res.prefill).toEqual({ name: "Deal" })
    expect(res.resolution?.name.status).toBe("ok")
    expect(mockExtract).toHaveBeenCalledWith({ text: "an RFP", userId: "u1" })
  })

  it("passes through an unconfigured extraction without calling the resolver", async () => {
    mockExtract.mockResolvedValue({ ok: false, unconfigured: true, error: "AI is not configured." })
    const res = await generateOpportunityAction({ text: "x" })
    expect(res.ok).toBe(false)
    expect(res.unconfigured).toBe(true)
    expect(mockResolve).not.toHaveBeenCalled()
  })

  it("rejects empty input before any model call", async () => {
    const res = await generateOpportunityAction({ text: "" })
    expect(res.ok).toBe(false)
    expect(mockExtract).not.toHaveBeenCalled()
  })
})
