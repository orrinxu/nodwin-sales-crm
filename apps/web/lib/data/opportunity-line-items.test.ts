import { describe, it, expect, vi, beforeEach } from "vitest"
import { lineItemInputSchema } from "./opportunity-line-items"

const mockSelect = vi.fn()
const mockEq = vi.fn()
const mockOrder = vi.fn()
const mockSingle = vi.fn()
const mockFrom = vi.fn()
const mockRpc = vi.fn()

function buildMockChain() {
  const qb = { select: mockSelect, eq: mockEq, order: mockOrder, single: mockSingle }
  for (const key of Object.keys(qb)) {
    qb[key as keyof typeof qb].mockReturnValue(qb)
  }
  return qb
}

beforeEach(() => {
  vi.resetAllMocks()
  mockFrom.mockReturnValue(buildMockChain())
})

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom, rpc: mockRpc })),
}))
vi.mock("server-only", () => ({}))

const ctx = {
  user: { id: "aaaaaaaa-1111-1111-1111-111111111111", email: "rep@nodwin.com", role: "sales_rep" },
  source: "web" as const,
}
const OPP = "00000000-0000-0000-0000-0000000000a1"

describe("lineItemInputSchema", () => {
  it("requires a description", () => {
    expect(lineItemInputSchema.safeParse({ description: "" }).success).toBe(false)
    expect(lineItemInputSchema.safeParse({ description: "Banner" }).success).toBe(true)
  })

  it("rejects a non-positive quantity and defaults quantity/discount", () => {
    expect(lineItemInputSchema.safeParse({ description: "X", quantity: 0 }).success).toBe(false)
    const parsed = lineItemInputSchema.parse({ description: "X" })
    expect(parsed.quantity).toBe(1)
    expect(parsed.discountPct).toBe(0)
  })

  it("caps discount at 100", () => {
    expect(lineItemInputSchema.safeParse({ description: "X", discountPct: 101 }).success).toBe(false)
  })
})

describe("replaceOpportunityLineItems", () => {
  it("normalises amounts to the deal currency and calls the RPC with generated-free rows", async () => {
    mockSingle.mockResolvedValueOnce({ data: { currency: "INR" }, error: null })
    mockRpc.mockResolvedValueOnce({ error: null })

    const { replaceOpportunityLineItems } = await import("./opportunity-line-items")
    await replaceOpportunityLineItems(ctx, OPP, [
      { productId: null, description: "Custom", quantity: 2, unitPriceAmount: "100", discountPct: 10 },
    ])

    expect(mockRpc).toHaveBeenCalledWith("replace_opportunity_line_items", {
      _opportunity_id: OPP,
      _rows: [
        expect.objectContaining({
          product_id: null,
          description: "Custom",
          quantity: 2,
          unit_price_amount: "100.00",
          unit_cost_amount: "0.00",
          discount_pct: 10,
          position: 0,
        }),
      ],
    })
    // line_total is generated in the DB — never sent in the payload.
    const rows = (mockRpc.mock.calls[0][1] as { _rows: Record<string, unknown>[] })._rows
    expect(rows[0]).not.toHaveProperty("line_total")
  })

  it("throws when the RPC returns an error", async () => {
    mockSingle.mockResolvedValueOnce({ data: { currency: "USD" }, error: null })
    mockRpc.mockResolvedValueOnce({ error: new Error("boom") })
    const { replaceOpportunityLineItems } = await import("./opportunity-line-items")
    await expect(
      replaceOpportunityLineItems(ctx, OPP, [{ description: "X", quantity: 1 }]),
    ).rejects.toThrow("Failed to save line items")
  })
})

describe("getOpportunityLineItems", () => {
  it("maps rows to domain, Money-formatting amounts in the deal currency", async () => {
    mockSingle.mockResolvedValueOnce({ data: { currency: "USD" }, error: null })
    mockOrder.mockResolvedValueOnce({
      data: [
        {
          id: "11111111-1111-1111-1111-111111111111",
          opportunity_id: OPP,
          product_id: null,
          description: "Banner",
          quantity: "2",
          unit_price_amount: "100.0000",
          unit_cost_amount: "0.0000",
          discount_pct: "10.00",
          position: 0,
          line_total: "180.0000",
        },
      ],
      error: null,
    })

    const { getOpportunityLineItems } = await import("./opportunity-line-items")
    const result = await getOpportunityLineItems(ctx, OPP)
    expect(result).toHaveLength(1)
    expect(result[0].unitPriceAmount).toBe("100.00")
    expect(result[0].lineTotal).toBe("180.00")
    expect(result[0].discountPct).toBe(10)
    expect(result[0].productId).toBeNull()
  })
})
