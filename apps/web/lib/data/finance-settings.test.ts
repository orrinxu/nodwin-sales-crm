import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("server-only", () => ({}))

let readRow: Record<string, unknown> | null = null
const updateSpy = vi.fn().mockResolvedValue({ error: null })
const insertSpy = vi.fn().mockResolvedValue({ error: null })

function builder() {
  const b: Record<string, unknown> = {
    select: () => b,
    is: () => b,
    eq: () => ({ error: null }),
    maybeSingle: () => Promise.resolve({ data: readRow, error: null }),
    update: (payload: unknown) => {
      updateSpy(payload)
      return { eq: () => ({ error: null }) }
    },
    insert: (payload: unknown) => {
      insertSpy(payload)
      return { error: null }
    },
  }
  return b
}

vi.mock("@/lib/supabase/server", () => ({
  createServerClient: vi.fn(async () => ({ from: () => builder() })),
}))

const ctx = { user: { id: "u1", role: "admin" }, source: "web" as const }

beforeEach(() => {
  vi.clearAllMocks()
  readRow = null
})

describe("getCostOfCashSettings", () => {
  it("returns the group defaults (18%, integral, revenue) when no row exists", async () => {
    readRow = null
    const { getCostOfCashSettings, DEFAULT_COST_OF_CASH } = await import("./finance-settings")
    expect(await getCostOfCashSettings(ctx)).toEqual(DEFAULT_COST_OF_CASH)
  })

  it("maps a saved row", async () => {
    readRow = { annual_rate: "0.15000", financing_cost_method: "peak_duration", deduction_base: "profit" }
    const { getCostOfCashSettings } = await import("./finance-settings")
    expect(await getCostOfCashSettings(ctx)).toEqual({
      annualRate: 0.15,
      financingCostMethod: "peak_duration",
      deductionBase: "profit",
    })
  })
})

describe("setCostOfCashSettings", () => {
  const input = { annualRate: 0.2, financingCostMethod: "integral" as const, deductionBase: "revenue" as const }

  it("updates the existing group row", async () => {
    readRow = { id: "row-1" }
    const { setCostOfCashSettings } = await import("./finance-settings")
    await setCostOfCashSettings(ctx, input)
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ annual_rate: 0.2, financing_cost_method: "integral", deduction_base: "revenue" }),
    )
    expect(insertSpy).not.toHaveBeenCalled()
  })

  it("inserts a group row when none exists", async () => {
    readRow = null
    const { setCostOfCashSettings } = await import("./finance-settings")
    await setCostOfCashSettings(ctx, input)
    expect(insertSpy).toHaveBeenCalledWith(expect.objectContaining({ entity_id: null, annual_rate: 0.2 }))
    expect(updateSpy).not.toHaveBeenCalled()
  })

  it("rejects an out-of-range rate", async () => {
    const { setCostOfCashSettings } = await import("./finance-settings")
    await expect(setCostOfCashSettings(ctx, { ...input, annualRate: 42 })).rejects.toThrow()
  })
})
