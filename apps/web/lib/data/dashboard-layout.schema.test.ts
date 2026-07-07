import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/supabase/server", () => ({ createServerClient: vi.fn() }))

import { dashboardLayoutSchema } from "./dashboard-layout"

describe("dashboardLayoutSchema", () => {
  it("accepts a valid layout", () => {
    expect(
      dashboardLayoutSchema.parse([{ id: "summary-strip", colSpan: 12, rowSpan: 2 }]),
    ).toHaveLength(1)
  })

  it("rejects out-of-range spans", () => {
    expect(() =>
      dashboardLayoutSchema.parse([{ id: "x", colSpan: 13, rowSpan: 2 }]),
    ).toThrow()
    expect(() =>
      dashboardLayoutSchema.parse([{ id: "x", colSpan: 1, rowSpan: 0 }]),
    ).toThrow()
  })

  it("rejects non-integer spans", () => {
    expect(() =>
      dashboardLayoutSchema.parse([{ id: "x", colSpan: 2.5, rowSpan: 2 }]),
    ).toThrow()
  })

  it("rejects an over-long list", () => {
    const big = Array.from({ length: 51 }, () => ({ id: "x", colSpan: 1, rowSpan: 1 }))
    expect(() => dashboardLayoutSchema.parse(big)).toThrow()
  })
})
