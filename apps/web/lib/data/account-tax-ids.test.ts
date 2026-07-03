import { describe, it, expect, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }))

import { taxIdInputSchema, setAccountTaxIdsSchema } from "./account-tax-ids"

describe("taxIdInputSchema", () => {
  it("accepts a valid tax id", () => {
    expect(taxIdInputSchema.parse({ taxType: "IN_GSTIN", value: "22AAAAA0000A1Z5" })).toEqual({
      taxType: "IN_GSTIN",
      value: "22AAAAA0000A1Z5",
    })
  })

  it("trims the value and rejects an empty one", () => {
    expect(taxIdInputSchema.parse({ taxType: "IN_PAN", value: "  AAAAA1111A " }).value).toBe("AAAAA1111A")
    expect(() => taxIdInputSchema.parse({ taxType: "IN_PAN", value: "   " })).toThrow()
  })

  it("requires a tax type", () => {
    expect(() => taxIdInputSchema.parse({ taxType: "", value: "x" })).toThrow()
  })
})

describe("setAccountTaxIdsSchema", () => {
  it("accepts an empty set (clears tax ids)", () => {
    expect(setAccountTaxIdsSchema.parse({ taxIds: [] })).toEqual({ taxIds: [] })
  })

  it("accepts multiple tax ids", () => {
    const parsed = setAccountTaxIdsSchema.parse({
      taxIds: [
        { taxType: "IN_GSTIN", value: "22AAAAA0000A1Z5" },
        { taxType: "IN_PAN", value: "AAAAA1111A" },
      ],
    })
    expect(parsed.taxIds).toHaveLength(2)
  })
})
