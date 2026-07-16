import { describe, it, expect, vi, beforeEach } from "vitest"
import type { DealStage } from "@/lib/opportunity"

const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockIn = vi.fn()
const mockFrom = vi.fn()

function buildChain() {
  const qb = { select: mockSelect, eq: mockEq, in: mockIn }
  mockSelect.mockReturnValue(qb)
  mockEq.mockReturnValue(qb)
  return qb
}

beforeEach(() => {
  vi.resetAllMocks()
  mockFrom.mockImplementation(() => buildChain())
})

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom })),
}))
vi.mock("server-only", () => ({}))

const getSettings = vi.fn()
vi.mock("@/lib/data/sales-process-settings", () => ({
  getSalesProcessSettings: (...args: unknown[]) => getSettings(...args),
}))

const ctx = { user: { id: "u", email: "u@x.com", role: "admin" }, source: "web" as const }

const opps: { id: string; stage: DealStage }[] = [
  { id: "a", stage: "verbal_agreement" }, // has lines → false
  { id: "b", stage: "verbal_agreement" }, // no lines, not overridden → true
  { id: "c", stage: "verbal_agreement" }, // no lines, overridden + exempt → false
  { id: "d", stage: "qualify" }, // before stage → false
]

describe("attachLineItemsWarning", () => {
  it("flags at/after-stage deals without lines, honouring the override exemption", async () => {
    getSettings.mockResolvedValue({
      lineItemsRequiredFromStage: "verbal_agreement",
      lineItemsOverrideExempts: true,
    })
    // 1st query (line-item presence): deal "a" has lines.
    // 2nd query (override flags): deal "c" is overridden.
    mockIn
      .mockResolvedValueOnce({ data: [{ opportunity_id: "a" }], error: null })
      .mockResolvedValueOnce({ data: [{ id: "c" }], error: null })

    const { attachLineItemsWarning } = await import("./line-items-requirement")
    const out = await attachLineItemsWarning(ctx, opps)
    const flag = (id: string) => out.find((o) => o.id === id)?.needsLineItems

    expect(flag("a")).toBe(false)
    expect(flag("b")).toBe(true)
    expect(flag("c")).toBe(false)
    expect(flag("d")).toBe(false)
  })

  it("does no queries and flags nothing when the feature is off", async () => {
    getSettings.mockResolvedValue({
      lineItemsRequiredFromStage: null,
      lineItemsOverrideExempts: true,
    })
    const { attachLineItemsWarning } = await import("./line-items-requirement")
    const out = await attachLineItemsWarning(ctx, opps)
    expect(out.every((o) => o.needsLineItems === false)).toBe(true)
    expect(mockFrom).not.toHaveBeenCalled()
  })
})
